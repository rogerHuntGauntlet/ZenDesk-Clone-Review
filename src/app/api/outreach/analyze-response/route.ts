import { NextResponse } from 'next/server';
import { Client, Run } from "langsmith";
import { LangChainTracer } from "langchain/callbacks";
import { OpenAI } from 'openai';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

const OUTREACH_PROJECT_NAME = process.env.NEXT_PUBLIC_LANGSMITH_PROJECT_OUTREACH || "outreach-crm-ai";

// Initialize LangSmith components
const client = new Client({
    apiUrl: process.env.NEXT_PUBLIC_LANGSMITH_ENDPOINT_OUTREACH,
    apiKey: process.env.NEXT_PUBLIC_LANGSMITH_API_KEY_OUTREACH,
});

const tracer = new LangChainTracer({
    projectName: OUTREACH_PROJECT_NAME,
});

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Set a reasonable timeout for the analysis
const ANALYSIS_TIMEOUT = 30000; // 30 seconds

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
        // Validate request body
        let body;
        try {
            body = await request.json();
        } catch (e) {
            return NextResponse.json({ 
                error: 'Invalid request body' 
            }, { 
                status: 400 
            });
        }

        const { content, context } = body;

        if (!content) {
            return NextResponse.json({ 
                error: 'Missing required field: content' 
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

        const analysis = completion.choices[0]?.message?.content;

        if (!analysis) {
            throw new Error('No analysis generated');
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