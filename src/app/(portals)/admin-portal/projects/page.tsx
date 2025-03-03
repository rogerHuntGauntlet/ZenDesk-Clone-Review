"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "../hooks/useAuth";
import { useRouter } from "next/navigation";
import toast, { Toaster } from 'react-hot-toast';
import NewProjectModal from '../components/ui/new-project-modal';
import ProjectFilters from '../components/ui/ProjectFilters';
import ProjectMetrics from '../components/ui/ProjectMetrics';
import QuickActions from '../components/ui/QuickActions';
import { Project, ProjectStats } from '../types/project';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import AssignmentsModal from '../components/ui/AssignmentsModal';
import TeamManagement from '../components/ui/team-management/TeamManagement';
import AdminAnalytics from '../components/ui/analytics/AdminAnalytics';
import { useSupabase } from '../../../providers';

interface User {
  id: string;
  role: 'client' | 'employee' | 'admin';
  // Add other user fields as needed
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [filteredProjects, setFilteredProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('projects');
  const [stats, setStats] = useState<ProjectStats>({
    totalProjects: 0,
    activeProjects: 0,
    totalTickets: 0,
    activeTickets: 0,
    totalClients: 0,
    totalEmployees: 0
  });
  const { getCurrentUser } = useAuth();
  const router = useRouter();
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [viewingAssignments, setViewingAssignments] = useState<'clients' | 'employees' | null>(null);
  const [members, setMembers] = useState<{ clients: any[], employees: any[] }>({
    clients: [],
    employees: []
  });
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortField, setSortField] = useState("newest");
  const [isBulkActionLoading, setIsBulkActionLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: () => void;
    type: 'danger' | 'warning' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    action: () => {},
    type: 'info'
  });

  const supabase = useSupabase();

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const user = await getCurrentUser();
        if (!user) {
          router.push("/admin-portal/login");
          return;
        }

        const response = await fetch(`/admin-portal/api/projects?userId=${user.id}`);
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch projects');
        }
        const data = await response.json();
        setProjects(data);
        setFilteredProjects(data);
        
        // Calculate summary stats
        const stats = data.reduce((acc: ProjectStats, project: Project) => {
          acc.totalProjects++;
          if (project.status === 'active') acc.activeProjects++;
          acc.totalTickets += project.ticketCount || 0;
          acc.activeTickets += project.active_tickets || 0;
          acc.totalClients += project.clientCount || 0;
          acc.totalEmployees += project.employeeCount || 0;
          return acc;
        }, {
          totalProjects: 0,
          activeProjects: 0,
          totalTickets: 0,
          activeTickets: 0,
          totalClients: 0,
          totalEmployees: 0
        });
        
        setStats(stats);
        setError(null);
      } catch (error) {
        console.error("Failed to fetch projects:", error);
        setError(error instanceof Error ? error.message : 'An unexpected error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, []);

  useEffect(() => {
    let result = [...projects];

    // Apply search filter
    if (searchQuery) {
      result = result.filter(project =>
        project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        project.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      result = result.filter(project => project.status === statusFilter);
    }

    // Apply sorting
    result.sort((a, b) => {
      switch (sortField) {
        case 'newest':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'oldest':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'name':
          return a.name.localeCompare(b.name);
        case 'tickets':
          return (b.active_tickets || 0) - (a.active_tickets || 0);
        default:
          return 0;
      }
    });

    setFilteredProjects(result);
  }, [projects, searchQuery, statusFilter, sortField]);

  const handleCreateProject = async (projectData: { name: string; description: string; projectType: string }) => {
    try {
      const user = await getCurrentUser();
      if (!user) {
        throw new Error('You must be logged in to create a project');
      }

      const response = await fetch('/admin-portal/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...projectData,
          created_by: user.id,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create project');
      }

      const newProject = await response.json();

      // Refresh projects list
      const projectsResponse = await fetch(`/admin-portal/api/projects?userId=${user.id}`);
      if (!projectsResponse.ok) {
        throw new Error('Failed to refresh projects');
      }
      const updatedProjects = await projectsResponse.json();
      setProjects(updatedProjects);
      toast.success('Project created successfully');
      setIsNewProjectModalOpen(false);

      return { id: newProject.id };
    } catch (error) {
      console.error('Error in handleCreateProject:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create project');
      throw error;
    }
  };

  const handleExport = () => {
    try {
      const selectedData = projects.filter(p => selectedProjects.includes(p.id));
      const csv = [
        ['ID', 'Name', 'Description', 'Status', 'Active Tickets', 'Total Tickets', 'Clients', 'Employees', 'Created At'],
        ...selectedData.map(p => [
          p.id,
          p.name,
          p.description,
          p.status,
          p.active_tickets,
          p.ticketCount,
          p.clientCount,
          p.employeeCount,
          p.createdAt
        ])
      ].map(row => row.join(',')).join('\n');

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'projects-export.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast.success(`Successfully exported ${selectedProjects.length} project${selectedProjects.length !== 1 ? 's' : ''}`);
    } catch (error) {
      console.error('Error exporting projects:', error);
      toast.error('Failed to export projects');
    }
  };

  const handleBulkArchive = async () => {
    setConfirmDialog({
      isOpen: true,
      title: 'Archive Projects',
      message: `Are you sure you want to archive ${selectedProjects.length} project${selectedProjects.length !== 1 ? 's' : ''}? This action cannot be undone.`,
      type: 'danger',
      action: async () => {
        const toastId = toast.loading('Archiving projects...');
        setIsBulkActionLoading(true);
        try {
          const response = await fetch('/admin-portal/api/projects/bulk', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              projectIds: selectedProjects,
              action: 'archive'
            }),
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to archive projects');
          }

          // Refresh projects list
          const user = await getCurrentUser();
          const projectsResponse = await fetch(`/admin-portal/api/projects?userId=${user?.id}`);
          if (!projectsResponse.ok) {
            throw new Error('Failed to refresh projects');
          }
          const updatedProjects = await projectsResponse.json();
          setProjects(updatedProjects);
          setSelectedProjects([]); // Clear selection after successful action
          toast.success(`Successfully archived ${selectedProjects.length} project${selectedProjects.length !== 1 ? 's' : ''}`, {
            id: toastId
          });
        } catch (error) {
          console.error('Error in handleBulkArchive:', error);
          const errorMessage = error instanceof Error ? error.message : 'Failed to archive projects';
          setError(errorMessage);
          toast.error(errorMessage, { id: toastId });
        } finally {
          setIsBulkActionLoading(false);
        }
      }
    });
  };

  const handleBulkUpdateStatus = async (status: string) => {
    if (!status) return;
    
    setConfirmDialog({
      isOpen: true,
      title: 'Update Project Status',
      message: `Are you sure you want to update ${selectedProjects.length} project${selectedProjects.length !== 1 ? 's' : ''} to "${status}"?`,
      type: 'warning',
      action: async () => {
        const toastId = toast.loading(`Updating project status to ${status}...`);
        setIsBulkActionLoading(true);
        try {
          const response = await fetch('/admin-portal/api/projects/bulk', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              projectIds: selectedProjects,
              action: 'update_status',
              status
            }),
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to update project status');
          }

          // Refresh projects list
          const user = await getCurrentUser();
          const projectsResponse = await fetch(`/admin-portal/api/projects?userId=${user?.id}`);
          if (!projectsResponse.ok) {
            throw new Error('Failed to refresh projects');
          }
          const updatedProjects = await projectsResponse.json();
          setProjects(updatedProjects);
          setSelectedProjects([]); // Clear selection after successful action
          toast.success(`Successfully updated ${selectedProjects.length} project${selectedProjects.length !== 1 ? 's' : ''} to ${status}`, {
            id: toastId
          });
        } catch (error) {
          console.error('Error in handleBulkUpdateStatus:', error);
          const errorMessage = error instanceof Error ? error.message : 'Failed to update project status';
          setError(errorMessage);
          toast.error(errorMessage, { id: toastId });
        } finally {
          setIsBulkActionLoading(false);
        }
      }
    });
  };

  const toggleProjectSelection = (projectId: string) => {
    setSelectedProjects(prev =>
      prev.includes(projectId)
        ? prev.filter(id => id !== projectId)
        : [...prev, projectId]
    );
  };

  const fetchMembers = async (userId: string) => {
    if (!userId) return;
    
    try {
      const { data, error } = await supabase
        .from('zen_users')
        .select('*')
        .or(`role.eq.client,role.eq.employee`);

      if (error) {
        console.error('Error fetching members:', error);
        return;
      }

      if (!data) {
        console.error('No data returned from supabase');
        return;
      }

      const clients = data.filter((user: User) => user.role === 'client') || [];
      const employees = data.filter((user: User) => user.role === 'employee') || [];
      
      setMembers({ clients, employees });
    } catch (error) {
      console.error('Error in fetchMembers:', error);
    }
  };

  useEffect(() => {
    const init = async () => {
      const user = await getCurrentUser();
      if (user) {
        fetchMembers(user.id);
      }
    };
    init();
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h3 className="text-red-800 font-medium">Error</h3>
            <p className="text-red-600 mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="animate-pulse">
          <div className="h-8 w-48 bg-gray-200 rounded mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900">
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          success: {
            style: {
              background: 'rgba(34, 197, 94, 0.9)',
              color: '#fff',
              backdropFilter: 'blur(8px)',
            },
            iconTheme: {
              primary: '#fff',
              secondary: 'rgb(34, 197, 94)',
            },
          },
          error: {
            style: {
              background: 'rgba(239, 68, 68, 0.9)',
              color: '#fff',
              backdropFilter: 'blur(8px)',
            },
            iconTheme: {
              primary: '#fff',
              secondary: 'rgb(239, 68, 68)',
            },
            duration: 4000,
          },
          loading: {
            style: {
              background: 'rgba(99, 102, 241, 0.9)',
              color: '#fff',
              backdropFilter: 'blur(8px)',
            },
          },
        }}
      />

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.action}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
      />

      <div className="max-w-7xl mx-auto p-8">
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Admin Dashboard</h1>
            <p className="text-white/80 max-w-3xl">
              Welcome to the admin portal. Here you can manage projects, monitor support tickets, and oversee team performance.
            </p>
          </div>
          <button
            onClick={() => setIsNewProjectModalOpen(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500"
          >
            New Project
          </button>
        </div>

        <div className="border-b border-white/10 mb-8">
          <nav className="flex space-x-8" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('projects')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'projects'
                  ? 'border-violet-500 text-violet-500'
                  : 'border-transparent text-white/60 hover:text-white hover:border-white/20'
              }`}
            >
              Projects
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'analytics'
                  ? 'border-violet-500 text-violet-500'
                  : 'border-transparent text-white/60 hover:text-white hover:border-white/20'
              }`}
            >
              Analytics
            </button>
            <button
              onClick={() => setActiveTab('team-management')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'team-management'
                  ? 'border-violet-500 text-violet-500'
                  : 'border-transparent text-white/60 hover:text-white hover:border-white/20'
              }`}
            >
              Team Management
            </button>
          </nav>
        </div>

        {activeTab === 'projects' && (
          <>
            <ProjectMetrics stats={stats} projects={projects} />

            <ProjectFilters
              onSearch={setSearchQuery}
              onFilterStatus={setStatusFilter}
              onSort={setSortField}
            />

            <QuickActions
              selectedCount={selectedProjects.length}
              onExport={handleExport}
              onBulkArchive={handleBulkArchive}
              onBulkUpdateStatus={handleBulkUpdateStatus}
              isLoading={isBulkActionLoading}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProjects.map((project) => (
                <div
                  key={project.id}
                  className="bg-white/10 backdrop-blur-sm rounded-lg p-6 border border-white/10"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selectedProjects.includes(project.id)}
                          onChange={() => toggleProjectSelection(project.id)}
                          className="w-4 h-4 rounded border-white/20 bg-white/10 text-violet-500 focus:ring-violet-500"
                        />
                        <h3 className="text-lg font-semibold text-white">{project.name}</h3>
                      </div>
                      <p className="text-white/60 mt-1 line-clamp-2">{project.description}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-white/60">Status</span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium
                        ${project.status === 'active' ? 'bg-green-500/20 text-green-300' :
                          project.status === 'completed' ? 'bg-blue-500/20 text-blue-300' :
                          'bg-yellow-500/20 text-yellow-300'}`}>
                        {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
                      </span>
                    </div>

                    <div className="flex justify-between text-sm">
                      <span className="text-white/60">Active Tickets</span>
                      <span className="text-white">{project.active_tickets}</span>
                    </div>

                    <div className="flex justify-between text-sm">
                      <span className="text-white/60">Team Size</span>
                      <span className="text-white">{project.employeeCount} members</span>
                    </div>

                    <div className="flex justify-between text-sm">
                      <span className="text-white/60">Created</span>
                      <span className="text-white">
                        {new Date(project.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-white/10">
                    <Link
                      href={`/admin-portal/projects/${project.id}`}
                      className="text-violet-400 hover:text-violet-300 text-sm font-medium"
                    >
                      View Details →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {activeTab === 'team-management' && (
          <TeamManagement />
        )}

        {activeTab === 'analytics' && (
          <AdminAnalytics />
        )}
      </div>

      <NewProjectModal
        isOpen={isNewProjectModalOpen}
        onClose={() => setIsNewProjectModalOpen(false)}
        onSubmit={handleCreateProject}
      />

      <AssignmentsModal
        isOpen={viewingAssignments !== null}
        onClose={() => setViewingAssignments(null)}
        title={viewingAssignments === 'clients' ? 'Client Assignments' : 'Employee Assignments'}
        members={viewingAssignments === 'clients' ? members.clients : members.employees}
        type={viewingAssignments || 'clients'}
      />
    </div>
  );
} 