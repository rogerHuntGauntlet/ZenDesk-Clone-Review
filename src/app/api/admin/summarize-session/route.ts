import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import OpenAI from 'openai';

export const runtime = 'edge';

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { ticketId, ticket, activities, recordings, comment } = await req.json();

    // Format the activities into a readable format for the AI
    const formattedActivities = activities.map((activity: any) => {
      let description = `${activity.activity_type}: `;
      
      if (activity.content) {
        description += activity.content;
      }
      
      if (activity.metadata?.messages) {
        description += "\nChat messages:\n" + activity.metadata.messages
          .map((msg: any) => `${msg.role}: ${msg.content}`)
          .join("\n");
      }
      
      if (activity.media_url) {
        description += `\nRecorded ${activity.activity_type}`;
      }
      
      return description;
    }).join("\n\n");

    const prompt = `Please provide a concise summary of this support session. Here is the context:

Ticket Information:
Title: ${ticket.title}
Description: ${ticket.description}
Status: ${ticket.status}
Priority: ${ticket.priority}

Session Activities:
${formattedActivities}

${comment ? `\nAgent's notes: ${comment}` : ''}
${recordings.length > 0 ? `\nRecordings made: ${recordings.map((r: any) => r.type).join(', ')}` : ''}

Please summarize the key points, actions taken, and outcomes.`;

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      stream: true,
    });

    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of response) {
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            controller.enqueue(content);
          }
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-cache',
      },
    });

  } catch (error) {
    console.error('Error in summarize-session:', error);
    return new Response('Error generating summary', { status: 500 });
  }
} 