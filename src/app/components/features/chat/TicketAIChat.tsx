import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { ChatBubbleLeftIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface TicketAIChatProps {
  ticketId: string;
  onAnalysisComplete?: (analysis: any) => void;
}

interface APIResponse {
  response?: string;
  analysis?: any;
  error?: string;
  details?: string;
}

interface AnalysisResponse {
  analysis?: {
    summary: string;
    sentiment: 'positive' | 'neutral' | 'negative';
    suggestions: string[];
    keywords: string[];
  };
  error?: string;
  details?: string;
}

export const TicketAIChat: React.FC<TicketAIChatProps> = ({ ticketId, onAnalysisComplete }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const { toast } = useToast();

  const analyzeResponse = async (content: string) => {
    try {
      setIsAnalyzing(true);
      
      // Debug log
      console.log('Sending analysis request with payload:', {
        content,
        context: {
          ticketId,
          messageHistory: messages,
        },
      });

      const response = await fetch('/api/outreach/analyze-response', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content,
          context: {
            ticketId,
            messageHistory: messages,
          },
        }),
      });

      if (!response.ok) {
        if (response.status === 504) {
          throw new Error('Analysis timed out. Please try with a shorter message.');
        }
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to analyze response');
      }

      const data: AnalysisResponse = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      return data.analysis;
    } catch (error) {
      console.error('Analysis error:', error);
      throw error;
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim()) return;

    try {
      setIsLoading(true);
      // Add user message to chat
      const userMessage: Message = { role: 'user', content: input };
      setMessages(prev => [...prev, userMessage]);
      setInput('');

      console.log('Sending message to AI:', input);

      // Send message to API
      const response = await fetch('/api/tickets/ai-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ticketId,
          message: input,
          history: messages,
        }),
      });

      console.log('AI response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('AI response error:', errorText);
        throw new Error(errorText || 'Failed to get AI response');
      }

      const data: APIResponse = await response.json();
      console.log('AI response data:', data);

      if (!data) {
        throw new Error('Empty response received from AI');
      }

      if (data.error) {
        throw new Error(data.error);
      }

      if (!data.response) {
        throw new Error('No response content received from AI');
      }
      
      // Add AI response to chat
      const aiMessage: Message = { role: 'assistant', content: data.response };
      setMessages(prev => [...prev, aiMessage]);

      // Analyze the response if it's substantial
      if (data.response.length > 50) {
        try {
          console.log('Starting response analysis');
          const analysis = await analyzeResponse(data.response);
          console.log('Analysis completed:', analysis);
          if (analysis && onAnalysisComplete) {
            onAnalysisComplete(analysis);
          }
        } catch (analysisError) {
          console.error('Analysis error:', analysisError);
          // Don't show analysis errors to the user unless they specifically requested analysis
          if (input.toLowerCase().includes('analyze') || input.toLowerCase().includes('assessment')) {
            toast({
              title: 'Analysis Error',
              description: analysisError instanceof Error ? analysisError.message : 'Failed to analyze response',
              variant: 'destructive',
            });
          }
        }
      }

      // If analysis is included in response, call the callback
      if (data.analysis && onAnalysisComplete) {
        onAnalysisComplete(data.analysis);
      }
    } catch (error) {
      console.error('Chat error:', error);
      
      // Add error message to chat
      const errorMessage: Message = {
        role: 'assistant',
        content: 'I apologize, but I encountered an error. Please try again or contact support if the issue persists.'
      };
      setMessages(prev => [...prev, errorMessage]);
      
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to get AI response. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !isLoading) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex flex-col h-[500px] bg-gray-800 rounded-lg p-4">
      <div className="flex-1 overflow-y-auto space-y-4 mb-4">
        {messages.length === 0 ? (
          <div className="text-gray-400 text-center py-4">
            Start a conversation with the AI assistant
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${
                message.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-100'
                }`}
              >
                <div className="flex items-start gap-2">
                  {message.role === 'assistant' && (
                    <ChatBubbleLeftIcon className="w-5 h-5 mt-1 flex-shrink-0" />
                  )}
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                </div>
              </div>
            </div>
          ))
        )}
        {(isLoading || isAnalyzing) && (
          <div className="flex justify-center">
            <div className="animate-pulse text-gray-400">
              {isAnalyzing ? 'Analyzing response...' : 'Thinking...'}
            </div>
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Ask about this ticket..."
          className="flex-1"
          disabled={isLoading || isAnalyzing}
        />
        <Button
          onClick={handleSendMessage}
          disabled={isLoading || isAnalyzing}
          className="px-4"
        >
          <PaperAirplaneIcon className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}; 