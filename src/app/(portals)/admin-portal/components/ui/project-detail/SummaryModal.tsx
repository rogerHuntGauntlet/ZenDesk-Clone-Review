import { useState, useEffect, useRef } from 'react';
import { Dialog } from '@headlessui/react';
import { toast } from 'sonner';

interface SummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (summary: string) => void;
  ticketId: string;
  ticket: any;
  activities: any[];
  recordings: Array<{ url: string; type: string }>;
  comment: string;
}

export function SummaryModal({
  isOpen,
  onClose,
  onSubmit,
  ticketId,
  ticket,
  activities,
  recordings,
  comment
}: SummaryModalProps) {
  const [summary, setSummary] = useState('');
  const [isGenerating, setIsGenerating] = useState(true);
  const [streamedContent, setStreamedContent] = useState('');
  const contentRef = useRef('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      generateSummary();
    }
  }, [isOpen]);

  const generateSummary = async () => {
    try {
      setIsGenerating(true);
      setStreamedContent('');
      contentRef.current = '';

      const response = await fetch('/api/admin/summarize-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId,
          ticket,
          recordings,
          comment,
          activities
        })
      });

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value);
          contentRef.current += chunk;
          setStreamedContent(contentRef.current);
        }

        setSummary(contentRef.current);
      } catch (error) {
        console.error('Error reading stream:', error);
        throw error;
      } finally {
        setIsGenerating(false);
      }
    } catch (error) {
      console.error('Error generating summary:', error);
      toast.error('Failed to generate summary');
      setStreamedContent('Failed to generate summary automatically. Please provide a summary of the work done in this session.');
      setSummary('Failed to generate summary automatically. Please provide a summary of the work done in this session.');
      setIsGenerating(false);
    }
  };

  const handleSubmit = () => {
    if (!summary.trim()) {
      toast.error('Please provide a session summary');
      return;
    }
    
    setIsSubmitting(true);
    toast.loading('Processing session...');
    onSubmit(summary);
  };

  return (
    <Dialog
      open={isOpen}
      onClose={() => {
        if (!isSubmitting) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 overflow-y-auto"
    >
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50" aria-hidden="true" />
        
        <Dialog.Panel className="relative bg-gray-900 rounded-lg w-full max-w-2xl">
          <div className="p-6 space-y-4">
            <Dialog.Title className="text-xl font-semibold text-white">
              {isGenerating ? 'Generating Summary...' : isSubmitting ? 'Saving Session...' : 'Review Summary'}
            </Dialog.Title>

            <div className="space-y-4">
              {isGenerating ? (
                <div className="bg-gray-800/50 rounded-lg p-4 min-h-[200px]">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white/100 rounded-full animate-spin" />
                    <span className="text-white/60">AI is generating a summary...</span>
                  </div>
                  <div className="text-white/80 whitespace-pre-wrap">{streamedContent}</div>
                </div>
              ) : isSubmitting ? (
                <div className="bg-gray-800/50 rounded-lg p-4 min-h-[200px]">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white/100 rounded-full animate-spin" />
                    <span className="text-white/60">Saving session and activities...</span>
                  </div>
                  <div className="text-white/80 whitespace-pre-wrap">{summary}</div>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-white">
                    Review and edit the generated summary:
                  </label>
                  <textarea
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    className="w-full bg-gray-800/50 text-white rounded-lg px-4 py-3 text-sm border border-white/10 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    rows={8}
                    placeholder="Describe the work done in this session..."
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-4 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-white/60 hover:text-white"
                disabled={isGenerating || isSubmitting}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isGenerating || !summary.trim() || isSubmitting}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2"
              >
                {isSubmitting && (
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white/100 rounded-full animate-spin" />
                )}
                Submit
              </button>
            </div>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
} 