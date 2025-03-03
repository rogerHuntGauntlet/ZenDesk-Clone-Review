import { useState, useRef, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { usePathname } from 'next/navigation';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

interface ChatSession {
  id: string;
  messages: Message[];
  summary?: string;
  created_at: string;
}

interface AdminAIChatProps {
  ticketId: string;
  onSummaryGenerated?: (summary: string) => void;
  selectedSession?: Message[];
  onReset?: () => void;
  userRole?: 'client' | 'admin' | 'employee';
}

export function AdminAIChat({ ticketId, onSummaryGenerated, selectedSession, onReset }: AdminAIChatProps) {
  const [messages, setMessages] = useState<Message[]>(selectedSession || []);
  const [inputMessage, setInputMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const supabase = createClientComponentClient();
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const messagesRef = useRef<Message[]>(messages);

  // Keep messagesRef in sync with messages
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Determine user role from URL
  const getUserRole = () => {
    if (pathname.includes('/client-portal')) return 'client';
    if (pathname.includes('/employee-portal')) return 'employee';
    return 'admin';
  };

  const userRole = getUserRole();

  // Only reset when explicitly called with onReset
  useEffect(() => {
    if (onReset) {
      setMessages([]);
      setInputMessage('');
      setIsProcessing(false);
      setChatSessions([]);
      setSelectedSessionId(null);
    }
  }, [onReset]);

  // Load chat sessions
  useEffect(() => {
    if (selectedSession) {
      // Only set messages if we don't already have messages
      if (messagesRef.current.length === 0) {
        setMessages(selectedSession.map(msg => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        })));
      }
    } else if (!selectedSessionId) {
      loadChatSessions();
    }
  }, [ticketId, selectedSession]);

  const loadChatSessions = async () => {
    try {
      const { data: activities, error } = await supabase
        .from('zen_ticket_activities')
        .select('*')
        .eq('ticket_id', ticketId)
        .eq('activity_type', 'ai_chat')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const sessions = activities.map(activity => ({
        id: activity.id,
        messages: (activity.metadata.messages || []).map((msg: Message) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        })),
        summary: activity.metadata.summary,
        created_at: activity.created_at
      }));

      setChatSessions(sessions);

      // Only load most recent session if we don't have any messages yet
      if (sessions.length > 0 && messagesRef.current.length === 0) {
        setSelectedSessionId(sessions[0].id);
        setMessages(sessions[0].messages);
      }
    } catch (error) {
      console.error('Error loading chat sessions:', error);
      toast.error('Failed to load chat history');
    }
  };

  // Save chat session
  const saveChatSession = async (messages: Message[], summary?: string) => {
    try {
      const { data, error } = await supabase
        .from('zen_ticket_activities')
        .insert([{
          ticket_id: ticketId,
          activity_type: 'ai_chat',
          metadata: {
            messages: messages.map(msg => ({
              ...msg,
              timestamp: msg.timestamp.toISOString()
            })),
            summary
          },
          content: summary || 'AI Chat Session'
        }])
        .select()
        .single();

      if (error) throw error;

      // Update sessions list
      setChatSessions(prev => [{
        id: data.id,
        messages,
        summary,
        created_at: data.created_at
      }, ...prev]);

      setSelectedSessionId(data.id);
    } catch (error) {
      console.error('Error saving chat session:', error);
      toast.error('Failed to save chat session');
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async (content: string) => {
    if (!content.trim()) return;

    console.log('Starting to send message:', content);

    const newMessage: Message = {
      role: 'user',
      content,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, newMessage]);
    setInputMessage('');
    setIsProcessing(true);

    try {
      console.log('Making API request to /api/admin/ai-chat');
      // Add initial assistant message for streaming
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isStreaming: true
      }]);

      const response = await fetch('/api/admin/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId,
          message: content,
          history: messages.filter(msg => !msg.isStreaming),
          userRole: getUserRole()
        })
      });

      console.log('API Response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Response error:', errorText);
        toast.error(`Failed to get AI response: ${errorText}`);
        throw new Error(`Failed to get AI response: ${errorText}`);
      }

      if (!response.body) {
        toast.error('Response body is empty');
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedResponse = '';
      let hasReceivedContent = false;

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value);
          console.log('Received chunk:', chunk.substring(0, 50) + '...');
          accumulatedResponse += chunk;
          hasReceivedContent = true;

          setMessages(prev => {
            const newMessages = [...prev];
            const lastMessage = newMessages[newMessages.length - 1];
            if (lastMessage && lastMessage.isStreaming) {
              lastMessage.content = accumulatedResponse;
            }
            return [...newMessages];
          });
        }

        if (!hasReceivedContent) {
          toast.error('No response received from AI');
          throw new Error('No response received from AI');
        }

        // Final message update
        setMessages(prev => {
          const newMessages = [...prev];
          const lastMessage = newMessages[newMessages.length - 1];
          if (lastMessage && lastMessage.isStreaming) {
            lastMessage.isStreaming = false;
            lastMessage.content = accumulatedResponse;
          }
          return [...newMessages];
        });

        // Save the chat session with the correct role
        await saveChatSession([...messages, {
          role: 'assistant',
          content: accumulatedResponse,
          timestamp: new Date()
        }]);

      } catch (error) {
        throw error;
      } finally {
        reader.releaseLock();
      }

    } catch (error) {
      console.error('Error in AI chat:', error);
      toast.error('Failed to get AI response');
      setMessages(prev => prev.filter(msg => !msg.isStreaming));
    } finally {
      setIsProcessing(false);
    }
  };

  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Chat Sessions Timeline */}
      

      {/* Chat Messages */}
      <div
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {messages.length === 0 && (
          <div className="text-center text-white/60 py-8">
            {userRole === 'client' ? (
              <p>Ask me anything about your ticket. I'm here to help!</p>
            ) : (
              <p>Ask me for help with resolving this ticket.</p>
            )}
          </div>
        )}
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-3 ${
                message.role === 'user'
                  ? 'bg-violet-600 text-white'
                  : 'bg-gray-800 text-gray-100'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              <span className="text-xs opacity-60 mt-1 block">
                {message.timestamp.toLocaleTimeString()}
              </span>
            </div>
          </div>
        ))}
        {isProcessing && !messages[messages.length - 1]?.isStreaming && (
          <div className="flex justify-start">
            <div className="bg-gray-800 text-gray-100 rounded-lg p-3">
              <div className="flex space-x-2">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100" />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input Form */}
      <div className="flex-none p-4 border-t border-white/10 bg-gray-800/50">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(inputMessage);
          }}
          className="flex space-x-2"
        >
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder={userRole === 'client' ? "Ask for help with your ticket..." : "Ask AI for help..."}
            className="flex-1 bg-gray-900 text-white rounded-lg px-4 py-2.5 border border-white/10 focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
          <button
            type="submit"
            disabled={isProcessing || !inputMessage.trim()}
            className="bg-violet-600 text-white px-4 py-2.5 rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
} 