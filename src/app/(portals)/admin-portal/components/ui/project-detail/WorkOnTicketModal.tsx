import { useState, useEffect } from 'react';
import { Dialog } from '@headlessui/react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { toast } from 'sonner';
import { AdminAIChat } from './AdminAIChat';
import { AdminMediaRecorder } from './AdminMediaRecorder';
import { SummaryModal } from './SummaryModal';
import { RichTextEditor } from './RichTextEditor';
import { ResponseTemplates } from './ResponseTemplates';

interface WorkOnTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSessionComplete: () => void;
  ticket: any;
  readOnlySession?: {
    id: string;
    summary: string;
    created_at: string;
    created_by: string;
    user_email?: string;
    user_role?: 'admin' | 'employee' | 'client';
    activities: Activity[];
    expanded: boolean;
    ai_session_data?: {
      research_data?: {
        company: {
          name: string;
          overview: string;
          industry: string;
          size: string;
          technology: string[] | string;
          recent_developments: string;
          product?: string;
        };
        person: {
          name: string;
          email: string;
          role: string;
          background: string;
          interests: string[];
          pain_points: string[];
        };
        qualification_score: number;
      };
    };
  };
  isLoadingActivities?: boolean;
  userRole?: 'admin' | 'employee' | 'client';
}

interface Activity {
  id: string;
  activity_type: string;
  content?: string;
  media_url?: string;
  created_at: string;
  metadata: any;
}

function isAISession(session: any): boolean {
  return session?.ai_session_data?.research_data !== undefined;
}

export default function WorkOnTicketModal({ isOpen, onClose, onSessionComplete, ticket, readOnlySession, isLoadingActivities, userRole = 'admin' }: WorkOnTicketModalProps) {
  const supabase = createClientComponentClient();
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recordings, setRecordings] = useState<Array<{ url: string; type: string }>>([]);
  const [sessionSummary, setSessionSummary] = useState('');
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activeFunction, setActiveFunction] = useState<'ai' | 'record' | 'notes' | null>('ai');
  const [recordingMode, setRecordingMode] = useState<'audio' | 'video' | 'screen' | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [isSummaryError, setIsSummaryError] = useState(false);
  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
  const [isTemplatesModalOpen, setIsTemplatesModalOpen] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [aiChatKey] = useState(`${ticket.id}-${Math.random()}`); // Create a stable key for AI chat

  // Initialize state based on whether we're viewing an existing session
  useEffect(() => {
    if (readOnlySession) {
      // Load existing session data
      setSessionSummary(readOnlySession.summary);
      setActivities(readOnlySession.activities);
    } else {
      // Start fresh for new session
      resetAllState();
    }
  }, [isOpen, readOnlySession]);

  const resetAllState = () => {
    setComment('');
    setRecordings([]);
    setSessionSummary('');
    setActivities([]);
    setActiveFunction('ai');
    setRecordingMode(null);
    setSelectedActivity(null);
    setIsComplete(false);
    setIsGeneratingSummary(false);
    setIsSummaryError(false);
    setIsEditingSummary(false);
    setIsSummaryModalOpen(false);
    setIsTemplatesModalOpen(false);
    setHasSubmitted(false);
    setResetKey(prev => prev + 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error('No user found');

      // Update ticket status to in_progress
      const { error: statusError } = await supabase
        .from('zen_tickets')
        .update({ status: 'in_progress' })
        .eq('id', ticket.id);

      if (statusError) throw statusError;

      // Add a comment if one was written
      if (comment.trim()) {
        const { error: commentError } = await supabase
          .from('zen_ticket_activities')
          .insert({
            ticket_id: ticket.id,
            activity_type: 'comment',
            content: comment,
            created_by: user.id
          });

        if (commentError) throw commentError;
      }

      // Save recordings if available
      if (recordings.length > 0) {
        const recordingActivities = recordings.map(recording => ({
          ticket_id: ticket.id,
          activity_type: recording.type,
          media_url: recording.url,
          content: `${recording.type} recording`,
          created_by: user.id
        }));

        const { error: recordingsError } = await supabase
          .from('zen_ticket_activities')
          .insert(recordingActivities);

        if (recordingsError) throw recordingsError;
      }

      // Save session summary if available
      if (sessionSummary) {
        const { error: summaryError } = await supabase
          .from('zen_ticket_summaries')
          .insert({
            ticket_id: ticket.id,
            summary: sessionSummary,
            created_by: user.id,
            created_by_role: 'admin'
          });

        if (summaryError) throw summaryError;
      }

      toast.success('Session saved successfully');
      
      // Reset all state and close
      resetAllState();
      onSessionComplete();
      onClose(); // Close the modal after successful submission
    } catch (error) {
      console.error('Error updating ticket:', error);
      toast.error('Failed to update ticket');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecordingComplete = async (url: string, type: 'audio' | 'video' | 'screen') => {
    setRecordings(prev => [...prev, { url, type }]);
    setIsComplete(false);
    setActivities(prev => [...prev, {
      id: Date.now().toString(), // temporary ID
      activity_type: type,
      media_url: url,
      content: `${type} recording`,
      created_at: new Date().toISOString(),
      metadata: {}
    }]);
  };

  const handleSaveAndGenerateSummary = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsGeneratingSummary(true);
      setIsSummaryModalOpen(true);
    } catch (error) {
      console.error('Error preparing session:', error);
      toast.error('Failed to prepare session');
      setIsGeneratingSummary(false);
    }
  };

  const handleSummarySubmit = async (summary: string) => {
    try {
      setIsSubmitting(true);
      setIsGeneratingSummary(true);
      
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error('No user found');

      // Step 1: Create summary
      toast.loading('Creating session summary...');
      const { data: summaryData, error: summaryError } = await supabase
        .from('zen_ticket_summaries')
        .insert({
          ticket_id: ticket.id,
          summary: summary,
          created_by: user.id,
          created_by_role: 'admin' // Assuming this is being used in admin portal
        })
        .select()
        .single();

      if (summaryError) throw summaryError;

      // Step 2: Save activities
      toast.loading('Saving session activities...');
      const sessionActivities = [];

      // Add recordings
      recordings.forEach(recording => {
        sessionActivities.push({
          ticket_id: ticket.id,
          activity_type: recording.type,
          media_url: recording.url,
          content: `${recording.type} recording`,
          metadata: {
            session_id: summaryData.id,
            type: 'recording'
          }
        });
      });

      // Add comments
      if (comment.trim()) {
        sessionActivities.push({
          ticket_id: ticket.id,
          activity_type: 'comment',
          content: comment,
          metadata: {
            session_id: summaryData.id,
            type: 'comment'
          }
        });
      }

      // Add existing activities
      activities.forEach(activity => {
        sessionActivities.push({
          ticket_id: ticket.id,
          activity_type: activity.activity_type,
          content: activity.content,
          media_url: activity.media_url,
          metadata: {
            ...activity.metadata,
            session_id: summaryData.id
          }
        });
      });

      // Save all activities
      if (sessionActivities.length > 0) {
        toast.loading('Saving recordings and activities...');
        const { error: activitiesError } = await supabase
          .from('zen_ticket_activities')
          .insert(sessionActivities);

        if (activitiesError) throw activitiesError;
      }

      // Step 3: Update ticket status if needed
      if (ticket.status === 'new') {
        toast.loading('Updating ticket status...');
        const { error: statusError } = await supabase
          .from('zen_tickets')
          .update({ status: 'in_progress' })
          .eq('id', ticket.id);

        if (statusError) throw statusError;
      }

      // Reset all state and close
      resetAllState();
      toast.success('Session saved successfully!');
      onSessionComplete();
    } catch (error) {
      console.error('Error saving session:', error);
      toast.error('Failed to save session. Please try again.');
      setIsSummaryModalOpen(false);
    } finally {
      setIsSubmitting(false);
      setIsGeneratingSummary(false);
    }
  };

  const formatActivityTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'video':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        );
      case 'audio':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        );
      case 'screen':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        );
      case 'ai_chat':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
          </svg>
        );
    }
  };

  const handleDeleteActivity = async (activityId: string) => {
    try {
      const { error } = await supabase
        .from('zen_ticket_activities')
        .delete()
        .eq('id', activityId);

      if (error) throw error;

      setActivities(prev => prev.filter(a => a.id !== activityId));
      toast.success('Activity deleted');
    } catch (error) {
      console.error('Error deleting activity:', error);
      toast.error('Failed to delete activity');
    }
  };

  const handleActivityClick = (activity: Activity) => {
    setSelectedActivity(activity);
    switch (activity.activity_type) {
      case 'ai_chat':
        setActiveFunction('ai');
        break;
      case 'audio':
      case 'video':
      case 'screen':
        setActiveFunction('record');
        setRecordingMode(activity.activity_type as 'audio' | 'video' | 'screen');
        break;
      case 'note':
        setActiveFunction('notes');
        break;
    }
  };

  const renderFunctionContent = () => {
    switch (activeFunction) {
      case 'ai':
        return (
          <div className="h-full flex flex-col bg-gray-800/50 rounded-lg overflow-hidden">
            <div className="flex-none p-6 border-b border-white/10">
              <h4 className="text-lg text-white font-medium">
                {userRole === 'client' ? 'AI Support Assistant' : 'AI Assistant'}
              </h4>
            </div>
            <div className="flex-1 min-h-0">
              <AdminAIChat 
                key={aiChatKey}
                ticketId={ticket.id}
                userRole={userRole}
                onSummaryGenerated={summary => setSessionSummary(prev => 
                  prev ? `${prev}\n\nAI Chat Summary:\n${summary}` : summary
                )}
                selectedSession={selectedActivity?.metadata?.messages}
                onReset={!readOnlySession ? () => setResetKey(prev => prev + 1) : undefined}
              />
            </div>
          </div>
        );
      case 'record':
        return (
          <div className="h-full flex flex-col">
            <div className="flex-none border-b border-white/10 bg-gray-800/50 p-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg text-white font-medium">Record Media</h4>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setRecordingMode('audio')}
                    className={`px-3 py-1.5 rounded-lg transition-colors ${
                      recordingMode === 'audio' ? 'bg-violet-600 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    Audio
                  </button>
                  <button
                    onClick={() => setRecordingMode('video')}
                    className={`px-3 py-1.5 rounded-lg transition-colors ${
                      recordingMode === 'video' ? 'bg-violet-600 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    Video
                  </button>
                  <button
                    onClick={() => setRecordingMode('screen')}
                    className={`px-3 py-1.5 rounded-lg transition-colors ${
                      recordingMode === 'screen' ? 'bg-violet-600 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    Screen
                  </button>
                </div>
              </div>

              {/* Recording Interface */}
              <div className="bg-gray-800/50 rounded-lg p-4">
                <AdminMediaRecorder
                  ticketId={ticket.id}
                  onRecordingComplete={handleRecordingComplete}
                  recordingType={recordingMode || 'audio'}
                />
              </div>
            </div>

            <div className="flex-1 min-h-0 p-4 overflow-y-auto">
              {/* Recordings List */}
              <div className="space-y-3">
                {activities
                  .filter(a => recordingMode ? a.activity_type === recordingMode : ['audio', 'video', 'screen'].includes(a.activity_type))
                  .map((activity) => (
                    <div 
                      key={activity.id}
                      className="flex items-start gap-4 text-white/80 bg-gray-800/50 rounded-lg p-3"
                    >
                      <div className="flex-shrink-0 mt-1">
                        {getActivityIcon(activity.activity_type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="font-medium capitalize">
                              {activity.activity_type}
                            </span>
                            <span className="text-sm text-white/40">
                              {formatActivityTime(activity.created_at)}
                            </span>
                          </div>
                          <button
                            onClick={() => handleDeleteActivity(activity.id)}
                            className="text-white/40 hover:text-red-400"
                            title="Delete Recording"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                        {activity.media_url && (
                          <div className="mt-2">
                            {activity.activity_type === 'video' || activity.activity_type === 'screen' ? (
                              <video
                                src={activity.media_url}
                                controls
                                className="w-full rounded"
                                style={{ maxHeight: '160px' }}
                              />
                            ) : (
                              <audio
                                src={activity.media_url}
                                controls
                                className="w-full"
                              />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        );
      case 'notes':
        return (
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg text-white font-medium">Work Notes</h4>
              <button
                onClick={() => setIsTemplatesModalOpen(true)}
                className="px-3 py-1.5 text-sm bg-violet-600/20 text-violet-400 rounded hover:bg-violet-600/30 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                </svg>
                Templates
              </button>
            </div>
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 min-h-0">
                <RichTextEditor
                  value={comment}
                  onChange={setComment}
                  placeholder="Add notes about what you're working on..."
                />
              </div>
            </div>
          </div>
        );
      default:
        return (
          <div className="h-full flex items-center justify-center text-white/60">
            Select a function from the sidebar to get started
          </div>
        );
    }
  };

  const handleClose = () => {
    // Don't reset on close anymore
    onClose();
  };

  return (
    <>
      <Dialog
        open={isOpen}
        onClose={handleClose}
        className="fixed inset-0 z-50 overflow-y-auto"
      >
        <div className="flex min-h-screen items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" aria-hidden="true" />
          
          <Dialog.Panel className="relative bg-gray-900 rounded-lg w-full max-w-[95vw] h-[95vh] flex flex-col">
            <div className="flex-none p-6 border-b border-white/10">
              <div className="flex justify-between items-center">
                <Dialog.Title className="text-2xl font-semibold text-white">
                  {readOnlySession ? 'Session Details' : 'Work on Ticket'}
                </Dialog.Title>
                {!readOnlySession && (
                  <button
                    onClick={resetAllState}
                    className="px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-lg transition-colors"
                  >
                    Clear All Data
                  </button>
                )}
              </div>
              <div className="mt-2">
                <h3 className="text-lg font-medium text-white">{ticket.title}</h3>
                <p className="text-white/60 mt-1">{ticket.description}</p>
              </div>
            </div>

            {!readOnlySession ? (
              <div className="flex-1 flex min-h-0">
                {/* Left Sidebar */}
                <div className="flex-none w-20 bg-gray-800/50 border-r border-white/10 p-4 flex flex-col items-center gap-6">
                  <button
                    onClick={() => setActiveFunction('ai')}
                    className={`p-3 rounded-lg transition-colors ${
                      activeFunction === 'ai' ? 'bg-violet-600 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'
                    }`}
                    title="AI Assistant"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => {
                      setActiveFunction('record');
                      if (!recordingMode) setRecordingMode('audio');
                    }}
                    className={`p-3 rounded-lg transition-colors ${
                      activeFunction === 'record' ? 'bg-violet-600 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'
                    }`}
                    title="Record Media"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setActiveFunction('notes')}
                    className={`p-3 rounded-lg transition-colors ${
                      activeFunction === 'notes' ? 'bg-violet-600 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'
                    }`}
                    title="Work Notes"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                </div>

                {/* Middle Content Area */}
                <div className="flex-1 p-6 min-w-0">
                  {renderFunctionContent()}
                </div>

                {/* Right Activities Column */}
                <div className="flex-none w-80 border-l border-white/10 flex flex-col min-h-0">
                  <div className="flex-none p-3 border-b border-white/10">
                    <div className="flex items-center justify-between">
                      <h4 className="text-lg text-white font-medium">Activities</h4>
                      {activities.length > 0 && !sessionSummary && (
                        <button
                          onClick={() => {
                            setIsSummaryModalOpen(true);
                          }}
                          className="px-2 py-1 bg-violet-600/20 text-violet-400 rounded hover:bg-violet-600/30 text-sm"
                        >
                          Generate Summary
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {isLoadingActivities ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="flex items-center gap-3">
                          <div className="w-5 h-5 border-2 border-white/20 border-t-white/100 rounded-full animate-spin" />
                          <span className="text-white/60">Loading session activities...</span>
                        </div>
                      </div>
                    ) : (
                      activities.map((activity) => (
                        <div 
                          key={activity.id}
                          className={`flex items-start gap-3 text-white/80 bg-gray-800/50 rounded p-2 ${
                            selectedActivity?.id === activity.id ? 'ring-2 ring-violet-500' : ''
                          } hover:bg-gray-800/70 cursor-pointer group`}
                          onClick={() => handleActivityClick(activity)}
                        >
                          <div className="flex-shrink-0 mt-0.5">
                            {getActivityIcon(activity.activity_type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="font-medium capitalize truncate">
                                  {activity.activity_type.replace('_', ' ')}
                                </span>
                                <span className="text-xs text-white/40 flex-shrink-0">
                                  {formatActivityTime(activity.created_at)}
                                </span>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteActivity(activity.id);
                                }}
                                className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-opacity"
                              >
                                Delete
                              </button>
                            </div>

                            {/* Display media content */}
                            {(activity.activity_type === 'audio' || activity.activity_type === 'video' || activity.activity_type === 'screen') && activity.media_url && (
                              <div className="mt-3">
                                {activity.activity_type === 'audio' ? (
                                  <audio 
                                    controls 
                                    className="w-full" 
                                    src={activity.media_url}
                                  >
                                    Your browser does not support the audio element.
                                  </audio>
                                ) : (
                                  <video 
                                    controls 
                                    className="w-full rounded" 
                                    src={activity.media_url}
                                  >
                                    Your browser does not support the video element.
                                  </video>
                                )}
                              </div>
                            )}

                            {/* Display comment content */}
                            {activity.content && activity.activity_type === 'comment' && (
                              <p className="text-sm text-white/60 mt-2">
                                {activity.content}
                              </p>
                            )}

                            {/* Display AI chat messages */}
                            {activity.metadata?.messages && (
                              <div className="mt-4 space-y-3">
                                {activity.metadata.messages.map((msg: any, index: number) => (
                                  <div
                                    key={index}
                                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                  >
                                    <div
                                      className={`max-w-[80%] rounded-lg p-3 ${
                                        msg.role === 'user'
                                          ? 'bg-violet-600/80 text-white'
                                          : 'bg-gray-700/80 text-gray-100'
                                      }`}
                                    >
                                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Show session summary only in non-AI view */}
                  {!readOnlySession && sessionSummary && (
                    <div className="flex-none p-3 border-t border-white/10">
                      <h4 className="text-sm text-white font-medium mb-2">Session Summary</h4>
                      <div className="bg-gray-800/50 rounded p-2">
                        <pre className="whitespace-pre-wrap text-xs text-white/80 line-clamp-3">{sessionSummary}</pre>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : readOnlySession.ai_session_data?.research_data ? (
              // AI session read-only layout
              <div className="flex-1 flex flex-col min-h-0 p-6">
                {/* Scrollable Content */}
                <div className="flex-1 bg-gray-800/50 rounded-lg overflow-hidden flex flex-col min-h-0">
                  <div className="flex-1 overflow-y-auto p-6">
                    {/* Research Data Grid */}
                    <div className="grid grid-cols-2 gap-6">
                      {/* Company Analysis */}
                      <div>
                        <h5 className="text-md font-medium text-white/80 mb-3">Company Analysis</h5>
                        <div className="bg-gray-900/50 rounded-lg p-4 space-y-4">
                          <div>
                            <h6 className="text-sm font-medium text-white/60 mb-2">Overview</h6>
                            <p className="text-sm text-white/80">{typeof readOnlySession.ai_session_data.research_data.company.overview === 'object' ? 
                              JSON.stringify(readOnlySession.ai_session_data.research_data.company.overview, null, 2) : 
                              readOnlySession.ai_session_data.research_data.company.overview}</p>
                          </div>
                          <div>
                            <h6 className="text-sm font-medium text-white/60 mb-2">Industry</h6>
                            <p className="text-sm text-white/80">{typeof readOnlySession.ai_session_data.research_data.company.industry === 'object' ? 
                              JSON.stringify(readOnlySession.ai_session_data.research_data.company.industry, null, 2) : 
                              readOnlySession.ai_session_data.research_data.company.industry}</p>
                          </div>
                          <div>
                            <h6 className="text-sm font-medium text-white/60 mb-2">Size</h6>
                            <p className="text-sm text-white/80">{typeof readOnlySession.ai_session_data.research_data.company.size === 'object' ? 
                              JSON.stringify(readOnlySession.ai_session_data.research_data.company.size, null, 2) : 
                              readOnlySession.ai_session_data.research_data.company.size}</p>
                          </div>
                          <div>
                            <h6 className="text-sm font-medium text-white/60 mb-2">Technology Stack</h6>
                            <p className="text-sm text-white/80">{Array.isArray(readOnlySession.ai_session_data.research_data.company.technology) ? 
                              readOnlySession.ai_session_data.research_data.company.technology.join(', ') : 
                              typeof readOnlySession.ai_session_data.research_data.company.technology === 'object' ?
                              JSON.stringify(readOnlySession.ai_session_data.research_data.company.technology, null, 2) :
                              readOnlySession.ai_session_data.research_data.company.technology}</p>
                          </div>
                          <div>
                            <h6 className="text-sm font-medium text-white/60 mb-2">Recent Developments</h6>
                            <p className="text-sm text-white/80">{typeof readOnlySession.ai_session_data.research_data.company.recent_developments === 'object' ? 
                              JSON.stringify(readOnlySession.ai_session_data.research_data.company.recent_developments, null, 2) : 
                              readOnlySession.ai_session_data.research_data.company.recent_developments}</p>
                          </div>
                        </div>
                      </div>

                      {/* Contact Analysis */}
                      <div>
                        <h5 className="text-md font-medium text-white/80 mb-3">Contact Analysis</h5>
                        <div className="bg-gray-900/50 rounded-lg p-4 space-y-4">
                          <div>
                            <h6 className="text-sm font-medium text-white/60 mb-2">Role</h6>
                            <p className="text-sm text-white/80">{readOnlySession.ai_session_data.research_data.person.role}</p>
                          </div>
                          <div>
                            <h6 className="text-sm font-medium text-white/60 mb-2">Background</h6>
                            <p className="text-sm text-white/80">{readOnlySession.ai_session_data.research_data.person.background}</p>
                          </div>
                          <div>
                            <h6 className="text-sm font-medium text-white/60 mb-2">Interests</h6>
                            <p className="text-sm text-white/80">{Array.isArray(readOnlySession.ai_session_data.research_data.person.interests) ? 
                              readOnlySession.ai_session_data.research_data.person.interests.join(', ') : 
                              'No interests found'}</p>
                          </div>
                          <div>
                            <h6 className="text-sm font-medium text-white/60 mb-2">Pain Points</h6>
                            <p className="text-sm text-white/80">{Array.isArray(readOnlySession.ai_session_data.research_data.person.pain_points) ? 
                              readOnlySession.ai_session_data.research_data.person.pain_points.join(', ') : 
                              'No pain points identified'}</p>
                          </div>
                        </div>
                      </div>

                      {/* Session Summary */}
                      {sessionSummary && (
                        <div>
                          <h5 className="text-md font-medium text-white/80 mb-3">Session Summary</h5>
                          <div className="bg-gray-900/50 rounded-lg p-4">
                            <pre className="whitespace-pre-wrap text-sm text-white/80">{sessionSummary}</pre>
                          </div>
                        </div>
                      )}

                      {/* Qualification Score */}
                      <div>
                        <h5 className="text-md font-medium text-white/80 mb-3">Qualification Score</h5>
                        <div className="bg-gray-900/50 rounded-lg p-4">
                          <div className="flex items-center gap-3">
                            <div className="flex-1 bg-gray-800 rounded-full h-2">
                              <div 
                                className={`h-full rounded-full ${
                                  (readOnlySession?.ai_session_data?.research_data?.qualification_score || 0) >= 70 ? 'bg-green-500' :
                                  (readOnlySession?.ai_session_data?.research_data?.qualification_score || 0) >= 40 ? 'bg-yellow-500' :
                                  'bg-red-500'
                                }`}
                                style={{ width: `${readOnlySession?.ai_session_data?.research_data?.qualification_score || 0}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium text-white/80">
                              {Math.round(readOnlySession?.ai_session_data?.research_data?.qualification_score || 0)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              // Non-AI session read-only layout
              <div className="flex-1 flex flex-col min-h-0 p-6">
                <div className="flex-1 bg-gray-800/50 rounded-lg overflow-hidden flex flex-col min-h-0">
                  <div className="flex-1 overflow-y-auto p-6">
                    <div className="grid grid-cols-2 gap-6 h-full">
                      {/* Session Summary */}
                      {sessionSummary && (
                        <div>
                          <h5 className="text-md font-medium text-white/80 mb-3">Session Summary</h5>
                          <div className="bg-gray-900/50 rounded-lg p-4">
                            <pre className="whitespace-pre-wrap text-sm text-white/80">{sessionSummary}</pre>
                          </div>
                        </div>
                      )}

                      {/* Session Activities */}
                      <div>
                        <h5 className="text-md font-medium text-white/80 mb-3">Session Activities</h5>
                        <div className="bg-gray-900/50 rounded-lg p-4">
                          <div className="space-y-4">
                            {activities.map((activity) => (
                              <div 
                                key={activity.id}
                                className="flex items-start gap-4 text-white/80 bg-gray-800/80 rounded-lg p-4"
                              >
                                <div className="flex-shrink-0 mt-1">
                                  {getActivityIcon(activity.activity_type)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-3">
                                    <span className="font-medium capitalize">
                                      {activity.activity_type.replace('_', ' ')}
                                    </span>
                                    <span className="text-sm text-white/40">
                                      {formatActivityTime(activity.created_at)}
                                    </span>
                                  </div>

                                  {/* Display media content */}
                                  {(activity.activity_type === 'audio' || activity.activity_type === 'video' || activity.activity_type === 'screen') && activity.media_url && (
                                    <div className="mt-3">
                                      {activity.activity_type === 'audio' ? (
                                        <audio 
                                          controls 
                                          className="w-full" 
                                          src={activity.media_url}
                                        >
                                          Your browser does not support the audio element.
                                        </audio>
                                      ) : (
                                        <video 
                                          controls 
                                          className="w-full rounded" 
                                          src={activity.media_url}
                                        >
                                          Your browser does not support the video element.
                                        </video>
                                      )}
                                    </div>
                                  )}

                                  {/* Display comment content */}
                                  {activity.content && activity.activity_type === 'comment' && (
                                    <p className="text-sm text-white/60 mt-2">
                                      {activity.content}
                                    </p>
                                  )}

                                  {/* Display AI chat messages */}
                                  {activity.metadata?.messages && (
                                    <div className="mt-4 space-y-3">
                                      {activity.metadata.messages.map((msg: any, index: number) => (
                                        <div
                                          key={index}
                                          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                        >
                                          <div
                                            className={`max-w-[80%] rounded-lg p-3 ${
                                              msg.role === 'user'
                                                ? 'bg-violet-600/80 text-white'
                                                : 'bg-gray-700/80 text-gray-100'
                                            }`}
                                          >
                                            <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex-none p-6 border-t border-white/10 flex justify-end gap-4">
              {isEditingSummary ? (
                <>
                  <div className="flex-1 max-w-2xl">
                    <label className="block text-sm font-medium text-white mb-2">
                      {isSummaryError ? 
                        'Automatic summary generation failed. Please provide a summary:' : 
                        'Review and edit the generated summary:'
                      }
                    </label>
                    <div className="flex gap-4">
                      <textarea
                        value={sessionSummary}
                        onChange={(e) => setSessionSummary(e.target.value)}
                        className="flex-1 bg-gray-800/50 text-white rounded-lg px-4 py-3 text-sm border border-white/10 focus:outline-none focus:ring-2 focus:ring-violet-500"
                        rows={3}
                        placeholder="Describe the work done in this session..."
                      />
                      {isSummaryError && (
                        <button
                          onClick={() => {
                            // Open voice recording for summary
                            setActiveFunction('record');
                            setRecordingMode('audio');
                          }}
                          className="flex-none px-4 py-2 bg-violet-600/20 text-violet-400 rounded-lg hover:bg-violet-600/30"
                          title="Record Summary"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="px-6 py-2.5 text-sm font-medium text-white/60 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      setIsSummaryModalOpen(true);
                    }}
                    className="px-6 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    Submit
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="px-6 py-2.5 text-sm font-medium text-white/60 hover:text-white"
                  >
                    Close
                  </button>
                  {!readOnlySession && !isComplete && (
                    <>
                      <button
                        onClick={() => {
                          setIsSummaryModalOpen(true);
                        }}
                        className="px-6 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                      >
                        Save & Generate Summary
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>

      <SummaryModal
        isOpen={isSummaryModalOpen}
        onClose={() => setIsSummaryModalOpen(false)}
        onSubmit={handleSummarySubmit}
        ticketId={ticket.id}
        ticket={ticket}
        activities={activities}
        recordings={recordings}
        comment={comment}
      />

      {/* Add Templates Modal */}
      <ResponseTemplates
        isOpen={isTemplatesModalOpen}
        onClose={() => setIsTemplatesModalOpen(false)}
        onSelectTemplate={(content) => {
          // If there's existing content, add a line break
          const newContent = comment ? `${comment}\n${content}` : content;
          setComment(newContent);
          setIsTemplatesModalOpen(false);
        }}
      />
    </>
  );
} 