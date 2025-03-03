import { NextResponse } from 'next/server';
import { OpenAI } from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Configuration
const ANALYSIS_TIMEOUT = 180000; // 180 seconds
const CHUNK_SIZE = 2000; // Characters per chunk
const MAX_RETRIES = 2;

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
    summary: string;
    sentiment: 'positive' | 'neutral' | 'negative';
    suggestions: string[];
    keywords: string[];
}

export async function POST(request: Request) {
    try {
        console.log('Analyzing response - Request received');
        
        let body;
        try {
            body = await request.json();
            console.log('Content length:', body?.content?.length || 0);
        } catch (e) {
            return NextResponse.json({ 
                error: 'Invalid request body',
                details: e instanceof Error ? e.message : 'Unknown parsing error'
            }, { 
                status: 400 
            });
        }

        const { content, context } = body;

        if (!content) {
            return NextResponse.json({ 
                error: 'Missing required field: content',
                receivedFields: Object.keys(body || {})
            }, { 
                status: 400 
            });
        }

        // For very long content, use chunked analysis
        if (content.length > CHUNK_SIZE) {
            console.log('Content exceeds chunk size, using chunked analysis');
            try {
                const analysis = await analyzeContentInChunks(content, context);
                return NextResponse.json({ analysis });
            } catch (error: any) {
                console.error('Chunked analysis error:', error);
                return NextResponse.json({ 
                    error: 'Analysis failed',
                    details: error.message || 'Error during chunked analysis'
                }, { 
                    status: 500 
                });
            }
        }

        // For shorter content, use regular analysis with timeout
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Analysis timed out')), ANALYSIS_TIMEOUT);
        });

        try {
            const analysis = await Promise.race([analyzeContent(content, context), timeoutPromise]);
            return NextResponse.json({ analysis });
        } catch (error: any) {
            console.error('Analysis error:', error);
            
            if (error.message === 'Analysis timed out') {
                return NextResponse.json({ 
                    error: 'Analysis timed out',
                    details: `The analysis took longer than ${ANALYSIS_TIMEOUT/1000} seconds. Trying chunking the content.`
                }, { 
                    status: 504 
                });
            }

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

async function analyzeContentInChunks(content: string, context?: any) {
    // Split content into chunks
    const chunks = [];
    for (let i = 0; i < content.length; i += CHUNK_SIZE) {
        chunks.push(content.slice(i, i + CHUNK_SIZE));
    }
    
    console.log(`Split content into ${chunks.length} chunks`);

    // Analyze each chunk
    const chunkAnalyses = await Promise.all(
        chunks.map(async (chunk, index) => {
            for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                try {
                    return await analyzeContent(
                        chunk,
                        {
                            ...context,
                            chunkInfo: {
                                index,
                                total: chunks.length,
                                isPartial: chunks.length > 1
                            }
                        }
                    );
                } catch (error) {
                    if (attempt === MAX_RETRIES) throw error;
                    // Wait before retrying
                    await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                }
            }
            throw new Error('Analysis failed after all retries');
        })
    );

    // Filter out any undefined results and combine analyses
    const validAnalyses = chunkAnalyses.filter((analysis): analysis is AnalysisResult => analysis !== undefined);
    return combineAnalyses(validAnalyses);
}

function combineAnalyses(analyses: AnalysisResult[]) {
    if (!analyses.length) return null;

    // Combine summaries
    const combinedSummary = analyses.map(a => a.summary).join('\n\n');

    // Get the most common sentiment
    const sentiments = analyses.map(a => a.sentiment);
    const sentimentCounts = sentiments.reduce((acc, sentiment) => {
        acc[sentiment] = (acc[sentiment] || 0) + 1;
        return acc;
    }, {} as Record<'positive' | 'neutral' | 'negative', number>);

    const sentiment = Object.entries(sentimentCounts)
        .sort(([, a], [, b]) => b - a)[0][0] as 'positive' | 'neutral' | 'negative';

    // Combine suggestions and keywords
    const suggestions = Array.from(new Set(analyses.flatMap(a => a.suggestions)));
    const keywords = Array.from(new Set(analyses.flatMap(a => a.keywords))).slice(0, 5);

    return {
        summary: combinedSummary,
        sentiment,
        suggestions,
        keywords
    };
}

async function analyzeContent(content: string, context?: any) {
    try {
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
    return analysis
        .split('\n')
        .filter(line => line.trim().startsWith('-') || line.trim().startsWith('•'))
        .map(line => line.trim().replace(/^[-•]\s*/, ''));
}

function extractKeywords(content: string): string[] {
    const words = content.toLowerCase().match(/\b\w+\b/g) || [];
    const wordCount = words.reduce((acc, word) => {
        if (word.length > 3) {
            acc[word] = (acc[word] || 0) + 1;
        }
        return acc;
    }, {} as Record<string, number>);
    
    return Object.entries(wordCount)
        .filter(([_, count]) => count > 1)
        .map(([word]) => word)
        .slice(0, 5);
} 