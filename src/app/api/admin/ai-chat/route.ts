import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import OpenAI from 'openai';

export const runtime = 'edge';

export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { ticketId, message, history, userRole } = await request.json();

    // Get ticket context
    const { data: ticket, error: ticketError } = await supabase
      .from('zen_tickets')
      .select(`
        *,
        zen_projects (
          name,
          description
        )
      `)
      .eq('id', ticketId)
      .single();

    if (ticketError) throw ticketError;

    // Prepare system message based on user role
    let systemMessage = '';
    if (userRole === 'client') {
      systemMessage = `You are a helpful AI support assistant for clients.
        You have access to the following ticket context:
        Ticket: ${JSON.stringify(ticket)}

        Help the client by:
        1. Providing clear explanations
        2. Offering troubleshooting guidance
        3. Answering questions about their ticket
        4. Being empathetic and professional
        
        Keep responses friendly and non-technical unless the client asks for technical details.`;
    } else {
      systemMessage = `You are a helpful AI assistant for support ticket agents.
        You have access to the following ticket context:
        Ticket: ${JSON.stringify(ticket)}

        Help the agent resolve the ticket by:
        1. Providing relevant technical information
        2. Suggesting troubleshooting steps
        3. Offering best practices
        4. Helping draft responses to the client
        
        Be concise but thorough in your responses.`;
    }

    // Prepare conversation history
    const messages = [
      {
        role: 'system',
        content: systemMessage
      },
      ...history.map((msg: any) => ({
        role: msg.role,
        content: msg.content
      })),
      {
        role: 'user',
        content: message
      }
    ];

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key is not configured' },
        { status: 500 }
      );
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    try {
      // Validate ticket exists
      if (!ticket) {
        return NextResponse.json(
          { error: 'Ticket not found' },
          { status: 404 }
        );
      }

      const response = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages,
        temperature: 0.7,
        max_tokens: 500,
        stream: true,
      });

      const stream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of response) {
              const content = chunk.choices[0]?.delta?.content;
              if (content) {
                controller.enqueue(content);
              }
            }
            controller.close();
          } catch (error) {
            console.error('Streaming error:', error);
            controller.error(error);
          }
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/plain',
          'Cache-Control': 'no-cache',
        },
      });
    } catch (error: any) {
      console.error('OpenAI API error:', error);
      
      // Handle specific OpenAI errors
      if (error.code === 'invalid_api_key') {
        return NextResponse.json(
          { error: 'Invalid OpenAI API key' },
          { status: 500 }
        );
      }
      
      if (error.code === 'insufficient_quota') {
        return NextResponse.json(
          { error: 'OpenAI API quota exceeded' },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { error: error.message || 'OpenAI API error occurred' },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('Error in ai-chat:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get AI response' },
      { status: 500 }
    );
  }
} 