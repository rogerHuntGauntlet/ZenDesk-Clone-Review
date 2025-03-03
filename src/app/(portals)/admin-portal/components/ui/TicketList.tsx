'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DragDropContext, Draggable, DropResult } from 'react-beautiful-dnd';
import { StrictModeDroppable } from '@/app/components/StrictModeDroppable';
import { ChevronDownIcon, ChevronUpIcon, Squares2X2Icon as ViewGridIcon, ListBulletIcon as ViewListIcon, TableCellsIcon as ViewBoardsIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { FiPlusCircle, FiClock, FiPause, FiCheckCircle, FiArchive, FiCircle, FiBook } from 'react-icons/fi';
import { cn } from '@/lib/utils';
import { Loader2, CheckIcon, CircleIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import ReactMarkdown from 'react-markdown';
import OutreachSequenceList from './OutreachSequenceList';
import { OutreachSequence } from '@/app/types/outreach';
import OutreachSequenceBuilder from './OutreachSequenceBuilder';

const TICKET_STATUSES = ['new', 'in_progress', 'resolved'] as const;

type TicketStatus = typeof TICKET_STATUSES[number];

interface Ticket {
  id: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: string;
  created_at: string;
  updated_at: string;
  project_id: string;
  assigned_to: string | null;
  category?: string;
  assignee?: {
    name: string;
    email: string;
  };
}

interface GroupedTickets {
  new: Ticket[];
  in_progress: Ticket[];
  resolved: Ticket[];
}

interface TicketListProps {
  tickets: Ticket[];
  projectId: string;
  onStatusChange: (ticketId: string, newStatus: TicketStatus) => Promise<void>;
  onAssignTicket: (ticketId: string) => void;
  onViewTimeline: (ticket: Ticket) => void;
  onRunAIUpdate?: (ticket: Ticket) => Promise<void>;
}

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

interface ProspectAnalysis {
  prospectInfo: {
    name: string;
    role: string;
    company: string;
  };
  keyPoints: string[];
  suggestedApproach: string;
}

type StepStatus = 'pending' | 'in_progress' | 'completed';

interface GenerationStep {
  taskName: string;
  status: StepStatus;
  startTime?: number;
  endTime?: number;
  error?: string;
}

const getStatusColor = (status: TicketStatus) => {
  switch (status) {
    case 'new':
      return 'bg-blue-500/10';
    case 'in_progress':
      return 'bg-yellow-500/10';
    case 'resolved':
      return 'bg-green-500/10';
    default:
      return 'bg-white/10';
  }
};

const getStatusIcon = (status: TicketStatus) => {
  switch (status) {
    case 'new':
      return <FiPlusCircle className="w-4 h-4" />;
    case 'in_progress':
      return <FiClock className="w-4 h-4" />;
    case 'resolved':
      return <FiCheckCircle className="w-4 h-4" />;
    default:
      return <FiCircle className="w-4 h-4" />;
  }
};

const getStatusDisplay = (status: TicketStatus) => {
  return status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

export default function TicketList({ tickets, projectId, onStatusChange, onAssignTicket, onViewTimeline, onRunAIUpdate }: TicketListProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [ticketView, setTicketView] = useState<'list' | 'grid' | 'kanban'>('list');
  const [ticketSearch, setTicketSearch] = useState('');
  const [showProspectsOnly, setShowProspectsOnly] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [showOutreachModal, setShowOutreachModal] = useState(false);
  const [showSequenceBuilder, setShowSequenceBuilder] = useState(false);
  const [sequences, setSequences] = useState<OutreachSequence[]>([]);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [groupedTickets, setGroupedTickets] = useState<GroupedTickets>({
    new: [],
    in_progress: [],
    resolved: []
  });
  const [batchFilters, setBatchFilters] = useState({
    status: '',
    category: '',
    priority: '',
    lastContactDays: 0
  });
  const [generationStep, setGenerationStep] = useState<string>('');
  const [generatedMessage, setGeneratedMessage] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string>('');
  const [batchPrompt, setBatchPrompt] = useState('');
  const [batchResults, setBatchResults] = useState<any>(null);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [isGeneratingEmail, setIsGeneratingEmail] = useState(false);
  const [generatedEmail, setGeneratedEmail] = useState<string | null>(null);
  const [generationSteps, setGenerationSteps] = useState<GenerationStep[]>([
    { taskName: 'Running Web Research', status: 'pending' },
    { taskName: 'Reviewing Ticket History', status: 'pending' },
    { taskName: 'Initializing Request', status: 'pending' },
    { taskName: 'Analyzing Ticket Context', status: 'pending' },
    { taskName: 'Generating Message', status: 'pending' },
    { taskName: 'Analyzing Response', status: 'pending' }
  ]);
  const [selectedStep, setSelectedStep] = useState<string | null>(null);
  const [stepDetails, setStepDetails] = useState<{
    research?: any;
    history?: any;
    analysis?: AnalysisResult | ProspectAnalysis;
    error?: string;
  } | null>(null);

  const filteredTickets = tickets.filter(ticket => {
    const matchesSearch = ticket.title.toLowerCase().includes(ticketSearch.toLowerCase()) ||
                         ticket.description.toLowerCase().includes(ticketSearch.toLowerCase());
    
    if (showProspectsOnly) {
      return ticket.category === 'prospect' && matchesSearch;
    }
    
    return matchesSearch;
  });

  const handleDragEnd = async (result: DropResult) => {
    setIsDragging(false);
    if (!result.destination) return;

    const ticketId = result.draggableId;
    const newStatus = result.destination.droppableId as TicketStatus;

    await onStatusChange(ticketId, newStatus);
  };

  const handleOpenOutreachModal = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setShowOutreachModal(true);
  };

  const handleCloseOutreachModal = () => {
    setSelectedTicket(null);
    setShowOutreachModal(false);
  };

  const handleBatchGenerate = async () => {
    if (!batchPrompt) return;
    
    setIsBatchGenerating(true);
    setBatchResults(null);
    
    try {
      const response = await fetch('/api/outreach/batch-generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          messageType: 'initial',
          filters: batchFilters,
          context: {
            tone: 'professional',
            customFields: {
              prompt: batchPrompt
            }
          }
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate messages');
      }

      const results = await response.json();
      setBatchResults(results);
      
      if (results.successful.length > 0) {
        toast({
          title: "Batch Generation Complete",
          description: `Successfully generated ${results.successful.length} messages`,
        });
      }

    } catch (error: unknown) {
      console.error('Error in batch generation:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'Failed to generate messages',
        variant: "destructive"
      });
    } finally {
      setIsBatchGenerating(false);
    }
  };

  const handleCreateSequence = async (sequence: OutreachSequence) => {
    try {
      const response = await fetch('/api/outreach/sequences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          sequence
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create sequence');
      }

      const newSequence = await response.json();
      setSequences(prev => [...prev, newSequence]);
      toast({
        title: "Success",
        description: "Outreach sequence created successfully",
      });
    } catch (error) {
      console.error('Error creating sequence:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'Failed to create sequence',
        variant: "destructive"
      });
    }
  };

  const handleUpdateSequence = async (sequence: OutreachSequence) => {
    try {
      const response = await fetch(`/api/outreach/sequences/${sequence.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          sequence
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update sequence');
      }

      const updatedSequence = await response.json();
      setSequences(prev => prev.map(seq => 
        seq.id === updatedSequence.id ? updatedSequence : seq
      ));
      toast({
        title: "Success",
        description: "Outreach sequence updated successfully",
      });
    } catch (error) {
      console.error('Error updating sequence:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'Failed to update sequence',
        variant: "destructive"
      });
    }
  };

  const handleExecuteSequence = async (sequenceId: string) => {
    try {
      const response = await fetch(`/api/outreach/sequences/${sequenceId}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to execute sequence');
      }

      const updatedSequence = await response.json();
      setSequences(prev => prev.map(seq => 
        seq.id === updatedSequence.id ? updatedSequence : seq
      ));
      toast({
        title: "Success",
        description: "Outreach sequence started successfully",
      });
    } catch (error) {
      console.error('Error executing sequence:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'Failed to execute sequence',
        variant: "destructive"
      });
    }
  };

  const handlePauseSequence = async (sequenceId: string) => {
    try {
      const response = await fetch(`/api/outreach/sequences/${sequenceId}/pause`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to pause sequence');
      }

      const updatedSequence = await response.json();
      setSequences(prev => prev.map(seq => 
        seq.id === updatedSequence.id ? updatedSequence : seq
      ));
      toast({
        title: "Success",
        description: "Outreach sequence paused successfully",
      });
    } catch (error) {
      console.error('Error pausing sequence:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'Failed to pause sequence',
        variant: "destructive"
      });
    }
  };

  const handleGenerateEmail = async (ticket: Ticket) => {
    setIsGeneratingEmail(true);
    setGeneratedEmail(null);
    setSelectedTicket(ticket);
    setShowOutreachModal(true);
    setSelectedStep(null);
    setStepDetails(null);
    
    // Initialize steps
    setGenerationSteps([
      { taskName: 'Running Web Research', status: 'pending' },
      { taskName: 'Reviewing Ticket History', status: 'pending' },
      { taskName: 'Initializing Request', status: 'pending' },
      { taskName: 'Analyzing Ticket Context', status: 'pending' },
      { taskName: 'Generating Message', status: 'pending' },
      { taskName: 'Analyzing Response', status: 'pending' }
    ]);

    try {
      // Step 1: Web Research
      setGenerationSteps(prev => prev.map(step => 
        step.taskName === 'Running Web Research'
          ? { ...step, status: 'in_progress', startTime: Date.now() }
          : step
      ));

      let research = null;
      try {
        const researchResponse = await fetch('/api/outreach/research', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticket })
        });

        const researchData = await researchResponse.json();
        
        if (researchData.status === 'completed') {
          research = researchData.research;
          setGenerationSteps(prev => prev.map(step => 
            step.taskName === 'Running Web Research'
              ? { ...step, status: 'completed', endTime: Date.now() }
              : step
          ));
          setStepDetails(prev => ({ ...prev, research: researchData.research }));
        } else {
          console.warn('Web research skipped or failed:', researchData.message);
          setGenerationSteps(prev => prev.map(step => 
            step.taskName === 'Running Web Research'
              ? { 
                  ...step, 
                  status: 'completed', 
                  endTime: Date.now(),
                  error: researchData.message || 'Web research unavailable'
                }
              : step
          ));
        }
      } catch (error) {
        console.warn('Web research failed:', error);
        setGenerationSteps(prev => prev.map(step => 
          step.taskName === 'Running Web Research'
            ? { 
                ...step, 
                status: 'completed', 
                endTime: Date.now(),
                error: 'Web research unavailable'
              }
            : step
        ));
      }

      // Step 2: Ticket History Review
      setGenerationSteps(prev => prev.map(step => 
        step.taskName === 'Reviewing Ticket History'
          ? { ...step, status: 'in_progress', startTime: Date.now() }
          : step
      ));

      let ticketHistory = null;
      try {
        const historyResponse = await fetch('/api/outreach/ticket-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticket })
        });

        const historyData = await historyResponse.json();
        
        if (historyData.status === 'completed') {
          ticketHistory = historyData.history;
          setGenerationSteps(prev => prev.map(step => 
            step.taskName === 'Reviewing Ticket History'
              ? { ...step, status: 'completed', endTime: Date.now() }
              : step
          ));
          setStepDetails(prev => ({ ...prev, history: historyData.history }));
        } else {
          console.warn('Ticket history review skipped or failed:', historyData.message);
          setGenerationSteps(prev => prev.map(step => 
            step.taskName === 'Reviewing Ticket History'
              ? { 
                  ...step, 
                  status: 'completed', 
                  endTime: Date.now(),
                  error: historyData.message || 'History review unavailable'
                }
              : step
          ));
        }
      } catch (error) {
        console.warn('Ticket history review failed:', error);
        setGenerationSteps(prev => prev.map(step => 
          step.taskName === 'Reviewing Ticket History'
            ? { 
                ...step, 
                status: 'completed', 
                endTime: Date.now(),
                error: 'History review unavailable'
              }
            : step
        ));
      }

      // Step 3: Initialize
      setGenerationSteps(prev => prev.map(step => 
        step.taskName === 'Initializing Request' 
          ? { ...step, status: 'in_progress', startTime: Date.now() }
          : step
      ));

      // Mark initialization as complete
      setGenerationSteps(prev => prev.map(step => 
        step.taskName === 'Initializing Request'
          ? { ...step, status: 'completed', endTime: Date.now() }
          : step
      ));

      // Step 4: Analyze Context
      setGenerationSteps(prev => prev.map(step => 
        step.taskName === 'Analyzing Ticket Context'
          ? { ...step, status: 'in_progress', startTime: Date.now() }
          : step
      ));

      const analysisResponse = await fetch('/api/outreach/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket, research, ticketHistory })
      });

      if (!analysisResponse.ok) {
        throw new Error('Failed to analyze ticket');
      }

      const { analysis } = await analysisResponse.json();
      
      setGenerationSteps(prev => prev.map(step => 
        step.taskName === 'Analyzing Ticket Context'
          ? { ...step, status: 'completed', endTime: Date.now() }
          : step
      ));
      setStepDetails(prev => ({ ...prev, analysis }));

      // Step 5: Generate Message
      setGenerationSteps(prev => prev.map(step => 
        step.taskName === 'Generating Message'
          ? { ...step, status: 'in_progress', startTime: Date.now() }
          : step
      ));

      const generateResponse = await fetch('/api/outreach/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          analysis: {
            ...analysis,
            projectContext: {
              id: projectId,
              title: selectedTicket?.project_id || 'Unknown',
              description: selectedTicket?.description || 'Unknown',
              priority: selectedTicket?.priority || 'Unknown',
              category: selectedTicket?.category || 'Unknown',
              status: selectedTicket?.status || 'Unknown',
              created_at: selectedTicket?.created_at || 'Unknown',
              updated_at: selectedTicket?.updated_at || 'Unknown'
            }
          }
        })
      });

      if (!generateResponse.ok) {
        throw new Error('Failed to generate email');
      }

      if (!generateResponse.body) {
        throw new Error('No response body received');
      }

      // Handle streaming response
      const reader = generateResponse.body.getReader();
      const decoder = new TextDecoder();
      let emailContent = '';

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (!line.trim() || !line.startsWith('data: ')) continue;
            
            const data = line.replace('data: ', '');
            if (data === '[DONE]') {
              setGenerationSteps(prev => prev.map(step => 
                step.taskName === 'Generating Message'
                  ? { ...step, status: 'completed', endTime: Date.now() }
                  : step
              ));
              continue;
            }

            try {
              const parsedData = JSON.parse(data);
              
              switch (parsedData.type) {
                case 'status':
                  console.log('📊 Status update:', parsedData.message);
                  break;
                
                case 'content':
                  emailContent += parsedData.content;
                  setGeneratedEmail(emailContent);
                  break;
                
                case 'error':
                  throw new Error(parsedData.message);
              }
            } catch (e) {
              console.error('Error parsing chunk:', e);
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      // Step 6: Analyze Response
      setGenerationSteps(prev => prev.map(step => 
        step.taskName === 'Analyzing Response'
          ? { ...step, status: 'in_progress', startTime: Date.now() }
          : step
      ));

      // Analyze the generated response
      try {
        console.log('Starting analysis with context:', {
          content: emailContent.substring(0, 100) + '...',
          context: {
            prospect: {
              name: selectedTicket?.assignee?.name,
              role: selectedTicket?.category,
              company: selectedTicket?.title
            },
            projectContext: {
              id: projectId,
              title: selectedTicket?.project_id
            }
          }
        });

        // Debug log
        console.log('Sending analysis request with full payload:', { 
          content: emailContent,
          context: {
            prospect: {
              name: selectedTicket?.assignee?.name || 'Unknown',
              role: selectedTicket?.category || 'Unknown',
              company: selectedTicket?.title || 'Unknown'
            },
            companyInfo: {
              industry: selectedTicket?.description || 'Unknown'
            },
            projectContext: {
              id: projectId,
              title: selectedTicket?.project_id || 'Unknown',
              description: selectedTicket?.description || 'Unknown',
              priority: selectedTicket?.priority || 'Unknown',
              category: selectedTicket?.category || 'Unknown',
              status: selectedTicket?.status || 'Unknown',
              created_at: selectedTicket?.created_at || 'Unknown',
              updated_at: selectedTicket?.updated_at || 'Unknown'
            }
          }
        });

        const analysisResponse = await fetch('/api/outreach/analyze-response', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            content: emailContent,
            context: {
              prospect: {
                name: selectedTicket?.assignee?.name || 'Unknown',
                role: selectedTicket?.category || 'Unknown',
                company: selectedTicket?.title || 'Unknown'
              },
              companyInfo: {
                industry: selectedTicket?.description || 'Unknown'
              },
              projectContext: {
                id: projectId,
                title: selectedTicket?.project_id || 'Unknown',
                description: selectedTicket?.description || 'Unknown',
                priority: selectedTicket?.priority || 'Unknown',
                category: selectedTicket?.category || 'Unknown',
                status: selectedTicket?.status || 'Unknown',
                created_at: selectedTicket?.created_at || 'Unknown',
                updated_at: selectedTicket?.updated_at || 'Unknown'
              }
            }
          })
        });

        console.log('Analysis response status:', analysisResponse.status);

        if (!analysisResponse.ok) {
          const errorData = await analysisResponse.json();
          console.error('Analysis response error:', errorData);
          throw new Error(errorData.error || 'Failed to analyze response');
        }

        const analysisResult = await analysisResponse.json();
        console.log('Analysis result received:', analysisResult);
        
        // Update step details with analysis result and project context
        setStepDetails(prev => {
          const newDetails = { 
            ...prev, 
            analysis: {
              ...analysisResult,
              projectContext: {
                id: projectId,
                title: selectedTicket?.project_id || 'Unknown',
                description: selectedTicket?.description || 'Unknown',
                priority: selectedTicket?.priority || 'Unknown',
                category: selectedTicket?.category || 'Unknown',
                status: selectedTicket?.status || 'Unknown',
                created_at: selectedTicket?.created_at || 'Unknown',
                updated_at: selectedTicket?.updated_at || 'Unknown'
              }
            } as AnalysisResult
          };
          console.log('Updated step details:', newDetails);
          return newDetails;
        });

        // Mark analysis step as complete
        setGenerationSteps(prev => {
          const newSteps = prev.map(step => 
            step.taskName === 'Analyzing Response'
              ? { ...step, status: 'completed' as const, endTime: Date.now() }
              : step
          );
          console.log('Updated generation steps:', newSteps);
          return newSteps;
        });
      } catch (error) {
        console.error('Error analyzing response:', error);
        setGenerationSteps(prev => prev.map(step => 
          step.taskName === 'Analyzing Response'
            ? { 
                ...step, 
                status: 'completed', 
                endTime: Date.now(),
                error: error instanceof Error ? error.message : 'Failed to analyze response'
              }
            : step
        ));
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to analyze response",
          variant: "destructive"
        });
      }

    } catch (error) {
      console.error('❌ Error generating email:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate email",
        variant: "destructive"
      });
      setGenerationSteps(prev => prev.map(step => ({
        ...step,
        status: 'completed',
        startTime: Date.now() - 1000,
        endTime: Date.now()
      })));
    } finally {
      setIsGeneratingEmail(false);
    }
  };

  // Function to render ticket card (shared between views)
  const renderTicketCard = (ticket: Ticket, className: string = '') => (
    <div
      key={ticket.id}
      className={`p-4 bg-white/5 rounded-lg space-y-2 ${className}`}
    >
      <div className="flex justify-between items-start">
        <h3 className="text-white font-medium">{ticket.title}</h3>
        <div className="flex items-center gap-2">
          <select
            value={ticket.status}
            onChange={(e) => onStatusChange(ticket.id, e.target.value as TicketStatus)}
            className="bg-white/5 text-xs rounded-md px-2 py-1 text-white border border-white/10 focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            {TICKET_STATUSES.map(status => (
              <option key={status} value={status}>
                {getStatusDisplay(status)}
              </option>
            ))}
          </select>
          <span className={cn(
            'px-2 py-1 rounded-full text-xs font-medium',
            getStatusColor(ticket.status)
          )}>
            {getStatusDisplay(ticket.status)}
          </span>
        </div>
      </div>
      <p className="text-white/60 text-sm">{ticket.description}</p>
      <div className="flex justify-between items-center pt-2">
        <div className="text-sm text-white/60">
          {ticket.assignee ? (
            <span>Assigned to: {ticket.assignee.name}</span>
          ) : (
            <span>Unassigned</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onAssignTicket(ticket.id)}
            className="text-violet-400 hover:text-violet-300 text-sm"
          >
            Assign
          </button>
          <button
            onClick={() => onViewTimeline(ticket)}
            className="bg-yellow-600/20 text-yellow-300 hover:bg-yellow-600/30 px-3 py-1 rounded-md text-sm"
          >
            Work on it
          </button>
          {ticket.category === 'prospect' && onRunAIUpdate && (
            <button
              onClick={() => onRunAIUpdate(ticket)}
              className="bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 px-3 py-1 rounded-md text-sm flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              AI Update
            </button>
          )}
          {ticket.category === 'prospect' && (
            <button
              onClick={() => handleGenerateEmail(ticket)}
              disabled={isGeneratingEmail}
              className="bg-violet-600/20 text-violet-300 hover:bg-violet-600/30 px-3 py-1 rounded-md text-sm flex items-center gap-1 disabled:opacity-50"
            >
              {isGeneratingEmail ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FiBook className="w-4 h-4" />
              )}
              OutreachGPT
            </button>
          )}
          {ticket.status !== 'resolved' && (
            <button
              onClick={() => onStatusChange(ticket.id, 'resolved')}
              className="bg-green-600/20 text-green-300 hover:bg-green-600/30 px-3 py-1 rounded-md text-sm"
            >
              Resolve
            </button>
          )}
        </div>
      </div>
    </div>
  );

  // Replace the existing "Batch Outreach" button with a sequence builder button
  const renderControls = () => (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Search tickets..."
          value={ticketSearch}
          onChange={(e) => setTicketSearch(e.target.value)}
          className="px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
        <label className="flex items-center gap-2 text-white/60">
          <input
            type="checkbox"
            checked={showProspectsOnly}
            onChange={(e) => setShowProspectsOnly(e.target.checked)}
            className="rounded bg-white/5 border-white/20 text-violet-500 focus:ring-violet-500"
          />
          Prospects Only
        </label>
      </div>
      <div className="flex items-center gap-2 bg-white/5 rounded-lg p-1">
        <button
          onClick={() => setTicketView('list')}
          className={`p-2 rounded ${ticketView === 'list' ? 'bg-white/10 text-violet-400' : 'text-white/60 hover:text-white'}`}
          title="List View"
        >
          <ViewListIcon className="w-5 h-5" />
        </button>
        <button
          onClick={() => setTicketView('grid')}
          className={`p-2 rounded ${ticketView === 'grid' ? 'bg-white/10 text-violet-400' : 'text-white/60 hover:text-white'}`}
          title="Grid View"
        >
          <ViewGridIcon className="w-5 h-5" />
        </button>
        <button
          onClick={() => setTicketView('kanban')}
          className={`p-2 rounded ${ticketView === 'kanban' ? 'bg-white/10 text-violet-400' : 'text-white/60 hover:text-white'}`}
          title="Kanban View"
        >
          <ViewBoardsIcon className="w-5 h-5" />
        </button>
      </div>
    </div>
  );

  const renderStepDetails = () => {
    console.log('Rendering step details:', {
      selectedStep,
      stepDetails,
      hasAnalysis: stepDetails?.analysis ? 'yes' : 'no',
      analysisType: stepDetails?.analysis ? ('scores' in (stepDetails.analysis || {}) ? 'AnalysisResult' : 'ProspectAnalysis') : 'none'
    });

    if (!selectedStep || !stepDetails) {
      console.log('No step selected or no step details available');
      return null;
    }

    switch (selectedStep) {
      case 'Running Web Research':
        return stepDetails.research ? (
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2 text-white">Search Query</h4>
              <p className="text-white/80">{stepDetails.research.searchQuery}</p>
            </div>
            <div>
              <h4 className="font-medium mb-2 text-white">Sources Found</h4>
              <ul className="space-y-2">
                {stepDetails.research.prospect.sources.map((source: any, index: number) => (
                  <li key={index} className="text-white/80">
                    <a href={source.url} target="_blank" rel="noopener noreferrer" 
                       className="text-violet-400 hover:text-violet-300">
                      {source.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2 text-white">Background Information</h4>
              <p className="text-white/80 whitespace-pre-wrap">
                {stepDetails.research.prospect.background}
              </p>
            </div>
          </div>
        ) : null;

      case 'Reviewing Ticket History':
        return stepDetails.history ? (
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2 text-white">Interaction Summary</h4>
              <div className="grid grid-cols-2 gap-4 text-white/80">
                <div>Total Sessions: {stepDetails.history.insights.totalSessions}</div>
                <div>Last Interaction: {new Date(stepDetails.history.insights.lastInteractionDate).toLocaleDateString()}</div>
              </div>
            </div>
            <div>
              <h4 className="font-medium mb-2 text-white">Common Activities</h4>
              <ul className="space-y-1">
                {stepDetails.history.insights.commonActivities.map((activity: any, index: number) => (
                  <li key={index} className="text-white/80">
                    {activity.type}: {activity.count} times
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2 text-white">Recent Sessions</h4>
              <div className="space-y-3">
                {stepDetails.history.sessions.map((session: any) => (
                  <div key={session.id} className="bg-white/5 p-3 rounded">
                    <div className="text-white mb-1">
                      {new Date(session.created_at).toLocaleDateString()}
                    </div>
                    <p className="text-white/80">{session.summary}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null;

      case 'Analyzing Ticket Context':
        if (!stepDetails?.analysis || !('prospectInfo' in stepDetails.analysis)) return null;
        
        const prospectAnalysis = stepDetails.analysis as ProspectAnalysis;
        return (
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2 text-white">Prospect Information</h4>
              <div className="grid grid-cols-2 gap-2 text-white/80">
                <div>Role: {prospectAnalysis.prospectInfo.role}</div>
                <div>Company: {prospectAnalysis.prospectInfo.company}</div>
              </div>
            </div>
            <div>
              <h4 className="font-medium mb-2 text-white">Key Points</h4>
              <ul className="list-disc pl-4 space-y-1">
                {prospectAnalysis.keyPoints.map((point, index) => (
                  <li key={index} className="text-white/80">{point}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2 text-white">Suggested Approach</h4>
              <p className="text-white/80">{prospectAnalysis.suggestedApproach}</p>
            </div>
          </div>
        );

      case 'Analyzing Response':
        if (!stepDetails.analysis || !('scores' in stepDetails.analysis)) {
          console.log('Analysis validation failed:', {
            hasStepDetails: true,
            hasAnalysis: !!stepDetails.analysis,
            hasScores: stepDetails.analysis ? 'scores' in stepDetails.analysis : false,
            analysisType: stepDetails.analysis ? Object.keys(stepDetails.analysis) : []
          });
          return <div className="text-white/60">Analysis data is not available yet.</div>;
        }
        
        const responseAnalysis = stepDetails.analysis as AnalysisResult;
        console.log('Rendering analysis with data:', {
          hasScores: !!responseAnalysis.scores,
          scoresKeys: Object.keys(responseAnalysis.scores || {}),
          hasKeyMetrics: !!responseAnalysis.keyMetrics,
          keyMetricsKeys: Object.keys(responseAnalysis.keyMetrics || {}),
          hasStrengths: !!responseAnalysis.strengths,
          strengthsCount: responseAnalysis.strengths?.length,
          hasImprovements: !!responseAnalysis.improvements,
          improvementsCount: responseAnalysis.improvements?.length,
          hasProjectContext: !!responseAnalysis.projectContext,
          overallScore: responseAnalysis.overallScore
        });
        return (
          <div className="space-y-6">
            {/* Project Context Section */}
            {responseAnalysis.projectContext && (
              <div className="bg-white/5 rounded-lg p-4">
                <h4 className="font-medium mb-4 text-violet-400">Project Context</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-white/60">Project ID:</span>
                    <span className="ml-2 text-white">{responseAnalysis.projectContext.id}</span>
                  </div>
                  <div>
                    <span className="text-white/60">Priority:</span>
                    <span className="ml-2 text-white">{responseAnalysis.projectContext.priority}</span>
                  </div>
                  <div>
                    <span className="text-white/60">Category:</span>
                    <span className="ml-2 text-white">{responseAnalysis.projectContext.category}</span>
                  </div>
                  <div>
                    <span className="text-white/60">Status:</span>
                    <span className="ml-2 text-white">{responseAnalysis.projectContext.status}</span>
                  </div>
                </div>
                {responseAnalysis.projectContext.description && (
                  <div className="mt-4">
                    <span className="text-white/60 block mb-2">Project Description:</span>
                    <p className="text-white/80 text-sm">{responseAnalysis.projectContext.description}</p>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-6">
              {/* Scores Section */}
              {responseAnalysis.scores && Object.keys(responseAnalysis.scores).length > 0 && (
                <div className="bg-white/5 rounded-lg p-4">
                  <h4 className="font-medium mb-4 text-violet-400">Message Scores</h4>
                  <div className="space-y-3">
                    {Object.entries(responseAnalysis.scores).map(([key, value]) => (
                      <div key={key} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-white/80">{key.charAt(0).toUpperCase() + key.slice(1)}</span>
                          <span className="text-white">{(value * 100).toFixed(0)}%</span>
                        </div>
                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-violet-500 rounded-full transition-all duration-500"
                            style={{ width: `${value * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Key Metrics Section */}
              {responseAnalysis.keyMetrics && Object.keys(responseAnalysis.keyMetrics).length > 0 && (
                <div className="bg-white/5 rounded-lg p-4">
                  <h4 className="font-medium mb-4 text-violet-400">Key Metrics</h4>
                  <div className="space-y-3">
                    {Object.entries(responseAnalysis.keyMetrics).map(([key, value]) => (
                      <div key={key} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-white/80">{key.charAt(0).toUpperCase() + key.slice(1)}</span>
                          <span className="text-white">{(value * 100).toFixed(0)}%</span>
                        </div>
                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-violet-500 rounded-full transition-all duration-500"
                            style={{ width: `${value * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Overall Score Section */}
            {typeof responseAnalysis.overallScore === 'number' && (
              <div className="bg-white/5 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-violet-400">Overall Effectiveness Score</h4>
                  <div className="text-2xl font-bold text-white">
                    {(responseAnalysis.overallScore * 100).toFixed(0)}%
                  </div>
                </div>
              </div>
            )}

            {/* Strengths and Improvements Section */}
            <div className="grid grid-cols-2 gap-6">
              {responseAnalysis.strengths && responseAnalysis.strengths.length > 0 && (
                <div className="bg-white/5 rounded-lg p-4">
                  <h4 className="font-medium mb-3 text-green-400">Strengths</h4>
                  <ul className="space-y-2">
                    {responseAnalysis.strengths.map((strength, index) => (
                      <li key={index} className="flex gap-2 text-sm">
                        <CheckIcon className="w-4 h-4 text-green-400 mt-1 flex-shrink-0" />
                        <span className="text-white/80">{strength}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {responseAnalysis.improvements && responseAnalysis.improvements.length > 0 && (
                <div className="bg-white/5 rounded-lg p-4">
                  <h4 className="font-medium mb-3 text-yellow-400">Areas for Improvement</h4>
                  <ul className="space-y-2">
                    {responseAnalysis.improvements.map((improvement, index) => (
                      <li key={index} className="flex gap-2 text-sm">
                        <svg className="w-4 h-4 text-yellow-400 mt-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <span className="text-white/80">{improvement}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Detailed Analysis Section */}
            {responseAnalysis.analysis && (
              <div className="bg-white/5 rounded-lg p-4">
                <h4 className="font-medium mb-3 text-violet-400">Detailed Analysis</h4>
                <p className="text-white/80 text-sm whitespace-pre-wrap leading-relaxed">
                  {responseAnalysis.analysis}
                </p>
              </div>
            )}
          </div>
        );

      default:
        console.log('Unknown step selected:', selectedStep);
        return <div className="text-white/60">No details available for this step.</div>;
    }
  };

  // Update the step click handler
  const handleStepClick = (step: GenerationStep) => {
    console.log('Step clicked:', {
      stepName: step.taskName,
      status: step.status,
      currentStepDetails: stepDetails,
      currentSelectedStep: selectedStep
    });

    if (step.status === 'completed') {
      setSelectedStep(step.taskName);
    }
  };

  return (
    <>
      <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-white">Tickets</h2>
          {renderControls()}
        </div>

        {/* Ticket Views */}
        {ticketView === 'kanban' ? (
          <DragDropContext
            onDragStart={() => setIsDragging(true)}
            onDragEnd={handleDragEnd}
          >
            <div className="grid grid-cols-3 gap-4">
              {TICKET_STATUSES.map((status) => (
                <StrictModeDroppable key={status} droppableId={status}>
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className="bg-white/5 rounded-lg p-4"
                    >
                      <h3 className="text-lg font-medium text-white mb-4">
                        {getStatusDisplay(status)}
                        <span className="ml-2 text-sm text-white/60">
                          ({groupedTickets[status].length})
                        </span>
                      </h3>
                      <div className="space-y-4">
                        {groupedTickets[status].map((ticket: Ticket, index: number) => (
                          <Draggable
                            key={ticket.id}
                            draggableId={ticket.id}
                            index={index}
                          >
                            {(provided) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                              >
                                {renderTicketCard(ticket)}
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    </div>
                  )}
                </StrictModeDroppable>
              ))}
            </div>
          </DragDropContext>
        ) : (
          <div className={ticketView === 'grid' ? 'grid grid-cols-2 gap-4' : 'space-y-4'}>
            {filteredTickets.map((ticket) => renderTicketCard(ticket))}
          </div>
        )}
      </div>

      {/* Outreach Modal */}
      {showOutreachModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-gray-900 rounded-lg w-full max-w-5xl mx-4 my-8">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-white">
                  {generatedEmail ? 'Generated Email' : 'Generating Email...'}
                </h3>
                <button
                  onClick={() => {
                    setShowOutreachModal(false);
                    setGeneratedEmail(null);
                    setGenerationSteps([]);
                    setSelectedStep(null);
                    setStepDetails(null);
                  }}
                  className="text-white/60 hover:text-white"
                >
                  <XMarkIcon className="w-6 h-6" />
                </button>
              </div>

              {/* Prospect Info Section */}
              <div className="mb-6 bg-white/5 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium text-white/80 mb-2">Prospect Information</h4>
                    <div className="space-y-1">
                      <p className="text-sm text-white/60">
                        <span className="font-medium text-white/80">Title:</span>{' '}
                        {selectedTicket?.title}
                      </p>
                      <p className="text-sm text-white/60">
                        <span className="font-medium text-white/80">Priority:</span>{' '}
                        {selectedTicket?.priority}
                      </p>
                      {selectedTicket?.assignee && (
                        <p className="text-sm text-white/60">
                          <span className="font-medium text-white/80">Contact:</span>{' '}
                          {selectedTicket.assignee.name}
                        </p>
                      )}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-white/80 mb-2">Context</h4>
                    <div className="text-sm text-white/60 line-clamp-4">
                      {selectedTicket?.description}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-6">
                {/* Left side: Email Content */}
                <div className="flex-1">
                  <div className="bg-white/5 rounded-lg p-4 h-[500px] overflow-y-auto">
                    {selectedStep ? (
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <h3 className="text-lg font-medium text-white">
                            {selectedStep} Details
                          </h3>
                          <button
                            onClick={() => setSelectedStep(null)}
                            className="text-white/60 hover:text-white"
                          >
                            <XMarkIcon className="w-5 h-5" />
                          </button>
                        </div>
                        {renderStepDetails()}
                      </div>
                    ) : generatedEmail ? (
                      <div className="whitespace-pre-wrap text-white/90">
                        {generatedEmail}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full text-white/60">
                        <Loader2 className="w-6 h-6 animate-spin mr-2" />
                        Generating email...
                      </div>
                    )}
                  </div>

                  {generatedEmail && !selectedStep && (
                    <div className="mt-6 flex justify-end gap-3">
                      <Button
                        onClick={() => {
                          navigator.clipboard.writeText(generatedEmail);
                          toast({
                            title: "Copied!",
                            description: "Email copied to clipboard",
                          });
                        }}
                        className="bg-violet-600 hover:bg-violet-700"
                      >
                        Copy to Clipboard
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowOutreachModal(false);
                          setGeneratedEmail(null);
                          setGenerationSteps([]);
                          setSelectedStep(null);
                          setStepDetails(null);
                        }}
                      >
                        Close
                      </Button>
                    </div>
                  )}
                </div>

                {/* Right side: Progress Steps */}
                <div className="w-80">
                  <div className="bg-white/5 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-white/80 mb-4">Generation Progress</h4>
                    <div className="space-y-4">
                      {generationSteps.map((step, index) => (
                        <button
                          key={step.taskName}
                          onClick={() => handleStepClick(step)}
                          className={cn(
                            "w-full flex items-center gap-3 p-2 rounded transition-colors",
                            step.status === 'completed' && "hover:bg-white/5 cursor-pointer",
                            selectedStep === step.taskName && "bg-white/5"
                          )}
                        >
                          <div className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center",
                            step.status === 'completed' && !step.error ? 'bg-green-500/20 text-green-400' :
                            step.status === 'completed' && step.error ? 'bg-yellow-500/20 text-yellow-400' :
                            step.status === 'in_progress' ? 'bg-blue-500/20 text-blue-400' :
                            'bg-gray-500/20 text-gray-400'
                          )}>
                            {step.status === 'completed' && !step.error ? (
                              <CheckIcon className="w-4 h-4" />
                            ) : step.status === 'completed' && step.error ? (
                              <XMarkIcon className="w-4 h-4" />
                            ) : step.status === 'in_progress' ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <CircleIcon className="w-4 h-4" />
                            )}
                          </div>
                          <div className="flex-1 text-left">
                            <div className="text-sm font-medium text-white">{step.taskName}</div>
                            {step.error ? (
                              <div className="text-xs text-yellow-400">{step.error}</div>
                            ) : step.startTime && (
                              <div className="text-xs text-white/60">
                                {step.endTime 
                                  ? `Completed in ${((step.endTime - step.startTime) / 1000).toFixed(2)}s`
                                  : 'In progress...'}
                              </div>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sequence Builder Modal */}
      {showSequenceBuilder && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-gray-900 rounded-lg w-full max-w-4xl mx-4 my-8">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-white">Outreach Sequences</h3>
                <button
                  onClick={() => setShowSequenceBuilder(false)}
                  className="text-white/60 hover:text-white"
                >
                  <XMarkIcon className="w-6 h-6" />
                </button>
              </div>

              <OutreachSequenceList
                sequences={sequences}
                onCreateSequence={handleCreateSequence}
                onUpdateSequence={handleUpdateSequence}
                onExecuteSequence={handleExecuteSequence}
                onPauseSequence={handlePauseSequence}
              />
            </div>
          </div>
        </div>
      )}

      {/* Batch Generation Modal */}
      {showBatchModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-gray-900 rounded-lg w-full max-w-2xl mx-4 my-8">
            <div className="sticky top-0 bg-gray-900 z-10 border-b border-white/10 p-6">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-white">Batch Generate Outreach Messages</h3>
                <button
                  onClick={() => setShowBatchModal(false)}
                  className="text-white/60 hover:text-white"
                >
                  <XMarkIcon className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    Status
                  </label>
                  <select
                    value={batchFilters.status}
                    onChange={(e) => setBatchFilters(prev => ({ ...prev, status: e.target.value }))}
                    className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white"
                  >
                    <option value="">All Statuses</option>
                    {TICKET_STATUSES.map(status => (
                      <option key={status} value={status}>
                        {getStatusDisplay(status)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    Category
                  </label>
                  <select
                    value={batchFilters.category}
                    onChange={(e) => setBatchFilters(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white"
                  >
                    <option value="">All Categories</option>
                    <option value="prospect">Prospects</option>
                    <option value="client">Clients</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    Priority
                  </label>
                  <select
                    value={batchFilters.priority}
                    onChange={(e) => setBatchFilters(prev => ({ ...prev, priority: e.target.value }))}
                    className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white"
                  >
                    <option value="">All Priorities</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    Last Contact (Days)
                  </label>
                  <input
                    type="number"
                    value={batchFilters.lastContactDays}
                    onChange={(e) => setBatchFilters(prev => ({ ...prev, lastContactDays: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white"
                    min="0"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Message Prompt
                </label>
                <textarea
                  value={batchPrompt}
                  onChange={(e) => setBatchPrompt(e.target.value)}
                  placeholder="Describe the message you want to send to the selected tickets..."
                  className="w-full h-32 px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              {isBatchGenerating && (
                <div className="bg-white/5 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
                    <span className="text-white/80">Generating messages...</span>
                  </div>
                </div>
              )}

              {batchResults && (
                <div className="space-y-4">
                  <div className="bg-white/5 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-white/80 mb-2">Results</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="text-white/60">Total Messages:</div>
                      <div className="text-white">{batchResults.summary.total}</div>
                      <div className="text-white/60">Successful:</div>
                      <div className="text-green-400">{batchResults.summary.succeeded}</div>
                      <div className="text-white/60">Failed:</div>
                      <div className="text-red-400">{batchResults.summary.failed}</div>
                      <div className="text-white/60">Average Time:</div>
                      <div className="text-white">{Math.round(batchResults.summary.averageGenerationTime)}ms</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="sticky bottom-0 bg-gray-900 border-t border-white/10 p-6">
              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowBatchModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleBatchGenerate}
                  disabled={!batchPrompt.trim() || isBatchGenerating}
                  className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50"
                >
                  {isBatchGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    'Generate Messages'
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
} 