import { NextResponse } from 'next/server';
import { OpenAI } from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Set a reasonable timeout for the analysis
const ANALYSIS_TIMEOUT = 120000; // 120 seconds

interface AnalysisResult {
    scores: {
        personalization: number;
        relevance: number;
        engagement: number;
        tone: number;
        callToAction: number;
    };
    keyMetrics: {
        readability: number;
        businessContext: number;
        valueProposition: number;
    };
    overallScore: number;
    strengths: string[];
    improvements: string[];
    analysis: string;
    projectContext?: {
        id: string;
        title: string;
        description: string;
        priority: string;
        category: string;
        status: string;
        created_at: string;
        updated_at: string;
    };
}

export async function POST(request: Request) {
    try {
        // Log the incoming request
        console.log('Analyzing response - Request received');
        
        // Validate request body
        let body;
        try {
            body = await request.json();
            console.log('Request body length:', body?.content?.length || 0);
        } catch (e) {
            console.error('Invalid request body:', e);
            return NextResponse.json({ 
                error: 'Invalid request body',
                details: e instanceof Error ? e.message : 'Unknown parsing error'
            }, { 
                status: 400 
            });
        }

        const { content, context } = body;

        if (!content) {
            console.error('Missing content field in request body');
            return NextResponse.json({ 
                error: 'Missing required field: content',
                receivedFields: Object.keys(body || {})
            }, { 
                status: 400 
            });
        }

        // Create a promise that rejects after the timeout
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Analysis timed out')), ANALYSIS_TIMEOUT);
        });

        // Create the analysis promise
        const analysisPromise = analyzeContent(content, context);

        // Race between the analysis and the timeout
        try {
            const analysis = await Promise.race([analysisPromise, timeoutPromise]);
            return NextResponse.json({ analysis });
        } catch (error: any) {
            console.error('Analysis error:', error);
            
            // Handle timeout specifically
            if (error.message === 'Analysis timed out') {
                return NextResponse.json({ 
                    error: 'Analysis timed out',
                    details: `The analysis took longer than ${ANALYSIS_TIMEOUT/1000} seconds to complete. Please try with a shorter message.`
                }, { 
                    status: 504 
                });
            }

            // Handle OpenAI specific errors
            if (error.code === 'insufficient_quota') {
                return NextResponse.json({
                    error: 'OpenAI API quota exceeded',
                    details: 'Please try again later'
                }, {
                    status: 429
                });
            }

            if (error.code === 'invalid_api_key') {
                return NextResponse.json({
                    error: 'Invalid OpenAI API key',
                    details: 'Please check your API key configuration'
                }, {
                    status: 500
                });
            }

            // Generic error response
            return NextResponse.json({ 
                error: 'Failed to analyze content',
                details: error.message || 'Unknown error occurred'
            }, { 
                status: 500 
            });
        }
    } catch (error) {
        console.error('Unexpected error:', error);
        return NextResponse.json({ 
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'An unexpected error occurred'
        }, { 
            status: 500 
        });
    }
}

async function analyzeContent(content: string, context?: any) {
    try {
        console.log('Starting OpenAI analysis with content length:', content.length);
        
        const completion = await openai.chat.completions.create({
            model: 'gpt-4-turbo-preview',
            messages: [
                {
                    role: 'system',
                    content: `You are an AI assistant analyzing content in the context of a support ticket system. 
Your goal is to provide insights and suggestions based on the content.
${context ? `Additional context: ${JSON.stringify(context)}` : ''}`
                },
                {
                    role: 'user',
                    content: `Please analyze the following content and provide insights:
${content}`
                }
            ],
            temperature: 0.7,
            max_tokens: 1000,
        });

        console.log('OpenAI response received');

        const analysis = completion.choices[0]?.message?.content;

        if (!analysis) {
            throw new Error('No analysis generated from OpenAI');
        }

        return {
            summary: analysis,
            sentiment: determineSentiment(content),
            suggestions: extractSuggestions(analysis),
            keywords: extractKeywords(content),
        };
    } catch (error) {
        console.error('OpenAI Analysis Error:', error);
        throw error;
    }
}

function determineSentiment(content: string): 'positive' | 'neutral' | 'negative' {
    const lowerContent = content.toLowerCase();
    
    const positiveWords = ['thank', 'great', 'good', 'excellent', 'appreciate', 'helpful'];
    const negativeWords = ['bad', 'issue', 'problem', 'error', 'fail', 'wrong', 'bug'];
    
    const positiveCount = positiveWords.filter(word => lowerContent.includes(word)).length;
    const negativeCount = negativeWords.filter(word => lowerContent.includes(word)).length;
    
    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
}

function extractSuggestions(analysis: string): string[] {
    // Simple extraction of suggestions (lines starting with - or •)
    return analysis
        .split('\n')
        .filter(line => line.trim().startsWith('-') || line.trim().startsWith('•'))
        .map(line => line.trim().replace(/^[-•]\s*/, ''));
}

function extractKeywords(content: string): string[] {
    // Simple keyword extraction (words that appear more than once)
    const words = content.toLowerCase().match(/\b\w+\b/g) || [];
    const wordCount = words.reduce((acc, word) => {
        if (word.length > 3) { // Only consider words longer than 3 characters
            acc[word] = (acc[word] || 0) + 1;
        }
        return acc;
    }, {} as Record<string, number>);
    
    return Object.entries(wordCount)
        .filter(([_, count]) => count > 1)
        .map(([word]) => word)
        .slice(0, 5); // Return top 5 keywords
} 