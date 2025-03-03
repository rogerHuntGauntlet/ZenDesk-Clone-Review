import { NextResponse } from 'next/server';
import { OpenAI } from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Set a reasonable timeout for the analysis
const ANALYSIS_TIMEOUT = 60000; // 60 seconds

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
            console.log('Request body:', JSON.stringify(body, null, 2));
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

        // Log the extracted content and context
        console.log('Extracted content:', content);
        console.log('Extracted context:', context);

        if (!content) {
            console.error('Missing content field in request body:', body);
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
            if (error.message === 'Analysis timed out') {
                return NextResponse.json({ 
                    error: 'Analysis timed out',
                    details: 'The analysis took too long to complete. Please try again with a shorter message.'
                }, { 
                    status: 504 
                });
            }
            throw error;
        }
    } catch (error) {
        console.error('Analysis Error:', error);
        return NextResponse.json({ 
            error: 'Failed to analyze content',
            details: error instanceof Error ? error.message : 'Unknown error'
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
            max_tokens: 500,
        });

        console.log('OpenAI response received:', {
            hasChoices: !!completion.choices,
            firstChoice: completion.choices[0] ? 'exists' : 'missing',
            hasContent: completion.choices[0]?.message?.content ? 'yes' : 'no'
        });

        const analysis = completion.choices[0]?.message?.content;

        if (!analysis) {
            console.error('No analysis content in OpenAI response:', completion);
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
        // Add more context to the error
        if (error instanceof Error) {
            throw new Error(`OpenAI Analysis failed: ${error.message}`);
        }
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