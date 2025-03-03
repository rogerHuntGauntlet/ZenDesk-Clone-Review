'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import ProspectInfoModal from '../../components/ui/ProspectInfoModal';
import { UserIcon } from '@heroicons/react/24/outline';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { TicketAIChat } from '@/app/components/features/chat/TicketAIChat';

export default function TicketPage({ params }: { params: { id: string } }) {
  const [isProspectModalOpen, setIsProspectModalOpen] = useState(false);
  const [ticket, setTicket] = useState<any>(null);
  const supabase = createClientComponentClient();

  const fetchTicketData = async () => {
    const { data, error } = await supabase
      .from('zen_tickets')
      .select('*')
      .eq('id', params.id)
      .single();

    if (error) {
      console.error('Error fetching ticket:', error);
      return;
    }

    setTicket(data);
  };

  useEffect(() => {
    fetchTicketData();
  }, [params.id]);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-semibold">{ticket?.title || 'Loading...'}</h1>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setIsProspectModalOpen(true)}
              variant="outline"
              className="flex items-center gap-2"
            >
              <UserIcon className="w-5 h-5" />
              Edit Prospect Info
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Ticket Details */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Ticket Details</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-gray-400">Description</label>
                  <p className="mt-1">{ticket?.description}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-400">Status</label>
                    <p className="mt-1">{ticket?.status}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-400">Priority</label>
                    <p className="mt-1">{ticket?.priority}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* AI Assistant */}
          <div className="lg:col-span-1">
            <div className="sticky top-6">
              <h2 className="text-xl font-semibold mb-4">AI Assistant</h2>
              <TicketAIChat
                ticketId={params.id}
                onAnalysisComplete={(analysis) => {
                  // Handle analysis results if needed
                  console.log('Ticket analysis:', analysis);
                }}
              />
            </div>
          </div>
        </div>

        {/* Add ProspectInfoModal */}
        <ProspectInfoModal
          isOpen={isProspectModalOpen}
          onClose={() => setIsProspectModalOpen(false)}
          ticket={ticket}
          onUpdate={() => {
            // Refresh ticket data after update
            fetchTicketData();
          }}
        />
      </div>
    </div>
  );
} 