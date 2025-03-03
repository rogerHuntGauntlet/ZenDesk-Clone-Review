import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

    const { ticketId, message, history } = body;

    // Validate required fields
    if (!ticketId || !message) {
      return NextResponse.json({ 
        error: 'Missing required fields: ticketId and message are required' 
      }, { 
        status: 400 
      });
    }

    const supabase = createRouteHandlerClient({ cookies });

    // Fetch ticket data
    const { data: ticket, error: ticketError } = await supabase
      .from('zen_tickets')
      .select(`
        *,
        zen_ticket_messages (
          content,
          created_at,
          user_id
        )
      `)
      .eq('id', ticketId)
      .single();

    if (ticketError) {
      return NextResponse.json({ 
        error: 'Failed to fetch ticket data',
        details: ticketError.message 
      }, { 
        status: 400 
      });
    }

    if (!ticket) {
      return NextResponse.json({ 
        error: 'Ticket not found' 
      }, { 
        status: 404 
      });
    }

    // Prepare conversation history for OpenAI
    const conversationHistory = [
      {
        role: 'system',
        content: `You are a helpful AI assistant analyzing a support ticket with the following details:
Title: ${ticket.title}
Description: ${ticket.description}
Priority: ${ticket.priority}
Status: ${ticket.status}

Your goal is to help the support agent understand and resolve this ticket effectively.
Provide clear, concise responses and suggest relevant actions when appropriate.`,
      },
      ...(Array.isArray(history) ? history.map((msg: any) => ({
        role: msg.role,
        content: msg.content,
      })) : []),
      {
        role: 'user',
        content: message,
      },
    ];

    try {
      // Get AI response
      const completion = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: conversationHistory,
        temperature: 0.7,
        max_tokens: 500,
      });

      const aiResponse = completion.choices[0]?.message?.content;

      if (!aiResponse) {
        throw new Error('No response from AI');
      }

      // Store the conversation in the database
      const { error: messageError } = await supabase
        .from('zen_ticket_messages')
        .insert([
          {
            ticket_id: ticketId,
            content: message,
            role: 'user',
          },
          {
            ticket_id: ticketId,
            content: aiResponse,
            role: 'assistant',
          },
        ]);

      if (messageError) {
        console.error('Failed to store messages:', messageError);
        // Continue execution even if storage fails
      }

      // Analyze ticket if needed
      let analysis = null;
      if (message.toLowerCase().includes('analyze') || message.toLowerCase().includes('assessment')) {
        analysis = {
          suggestedPriority: determinePriority(ticket),
          suggestedCategory: determineCategory(ticket),
          nextSteps: determineNextSteps(ticket),
        };
      }

      return NextResponse.json({
        response: aiResponse,
        analysis,
      });
    } catch (error) {
      console.error('OpenAI API Error:', error);
      return NextResponse.json({ 
        error: 'Failed to get AI response',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { 
        status: 500 
      });
    }
  } catch (error) {
    console.error('AI Chat Error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { 
      status: 500 
    });
  }
}

function determinePriority(ticket: any) {
  // Implement priority determination logic
  const urgentKeywords = ['urgent', 'emergency', 'critical', 'asap'];
  const description = ticket.description.toLowerCase();
  
  if (urgentKeywords.some(keyword => description.includes(keyword))) {
    return 'high';
  }
  return ticket.priority || 'medium';
}

function determineCategory(ticket: any) {
  // Implement category determination logic
  return ticket.category || 'general';
}

function determineNextSteps(ticket: any) {
  // Implement next steps determination logic
  const steps = [];
  
  if (!ticket.assigned_to) {
    steps.push('Assign ticket to an agent');
  }
  
  if (ticket.status === 'new') {
    steps.push('Review and categorize ticket');
    steps.push('Set initial priority');
  }
  
  return steps;
} 