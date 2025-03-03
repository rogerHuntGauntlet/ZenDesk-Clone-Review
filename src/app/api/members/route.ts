import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Project {
  id: string;
  name: string;
}

interface ProjectMember {
  id: string;
  role: string;
  project: Project;
}

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  projects: ProjectMember[];
}

interface SupabaseUser {
  id: string;
  email: string;
  name: string;
  role: string;
  projects: {
    id: string;
    role: string;
    project: Project;
  }[];
}

interface ZenUser {
  email: string;
  name: string;
}

interface Client {
  user_id: string;
  company: string;
  zen_users: ZenUser[];
}

interface Employee {
  user_id: string;
  department: string;
  zen_users: ZenUser[];
}

interface MemberData {
  clients: Array<{
    id: string;
    name: string;
    email: string;
    company: string;
    projects: Array<{
      id: string;
      name: string;
    }>;
  }>;
  employees: Array<{
    id: string;
    name: string;
    email: string;
    department: string;
    projects: Array<{
      id: string;
      name: string;
    }>;
  }>;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      console.error('No userId provided');
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    console.log('1. Fetching projects for admin:', userId);

    // Get all projects for this admin
    const { data: projects, error: projectsError } = await supabase
      .from('zen_projects')
      .select('id, name')
      .eq('admin_id', userId);

    if (projectsError) {
      console.error('Projects error:', projectsError);
      return NextResponse.json(
        { error: `Failed to fetch projects: ${projectsError.message}` },
        { status: 500 }
      );
    }

    console.log('2. Found projects:', projects);

    if (!projects || projects.length === 0) {
      console.log('No projects found for admin');
      return NextResponse.json({ clients: [], employees: [] });
    }

    const projectIds = projects.map(p => p.id);
    console.log('3. Project IDs:', projectIds);

    // Get all project members
    const { data: users, error: usersError } = await supabase
      .from('zen_users')
      .select(`
        id,
        email,
        name,
        role,
        projects:zen_project_members(
          id,
          role,
          project:zen_projects(
            id,
            name
          )
        )
      `)
      .or('role.eq.client,role.eq.employee')
      .in('id', projectIds);

    if (usersError) {
      console.error('Users error:', usersError);
      return NextResponse.json(
        { error: `Failed to fetch users: ${usersError.message}` },
        { status: 500 }
      );
    }

    const typedUsers = ((users || []) as any[]).map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      projects: (u.projects || []).map((p: any) => ({
        id: p.id,
        role: p.role,
        project: p.project
      }))
    })) as SupabaseUser[];

    // Get project details
    const { data: projectDetails, error: projectDetailsError } = await supabase
      .from('zen_projects')
      .select('id, name')
      .in('id', projectIds);

    if (projectDetailsError) {
      console.error('Project details error:', projectDetailsError);
      return NextResponse.json(
        { error: `Failed to fetch project details: ${projectDetailsError.message}` },
        { status: 500 }
      );
    }

    // Create a map of project details for easy lookup
    const projectMap = new Map(projectDetails?.map(p => [p.id, p]) || []);

    // Attach project details to members
    const membersWithProjects = typedUsers?.map(u => ({
      ...u,
      projects: u.projects?.map(p => p.project) || []
    })) || [];

    if (!membersWithProjects || membersWithProjects.length === 0) {
      console.log('No members found for projects');
      return NextResponse.json({ clients: [], employees: [] });
    }

    console.log('4. Found members:', membersWithProjects);

    // Get client details
    const clientUserIds = typedUsers
      .filter(u => u.role === 'client')
      .map(u => u.id);

    console.log('5. Client user IDs:', clientUserIds);

    let clients: Client[] = [];
    if (clientUserIds.length > 0) {
      const { data: clientsData, error: clientsError } = await supabase
        .from('zen_clients')
        .select(`
          user_id,
          company,
          zen_users!zen_clients_user_id_fkey(
            email,
            name
          )
        `)
        .in('user_id', clientUserIds);

      if (clientsError) {
        console.error('Clients error:', clientsError);
        return NextResponse.json(
          { error: `Failed to fetch client details: ${clientsError.message}` },
          { status: 500 }
        );
      }

      clients = clientsData || [];
    }

    console.log('6. Found clients:', clients);

    // Get employee details
    const employeeUserIds = typedUsers
      .filter(u => u.role === 'employee')
      .map(u => u.id);

    console.log('7. Employee user IDs:', employeeUserIds);

    let employees: Employee[] = [];
    if (employeeUserIds.length > 0) {
      const { data: employeesData, error: employeesError } = await supabase
        .from('zen_employees')
        .select(`
          user_id,
          department,
          zen_users!zen_employees_user_id_fkey(
            email,
            name
          )
        `)
        .in('user_id', employeeUserIds);

      if (employeesError) {
        console.error('Employees error:', employeesError);
        return NextResponse.json(
          { error: `Failed to fetch employee details: ${employeesError.message}` },
          { status: 500 }
        );
      }

      employees = employeesData || [];
    }

    console.log('8. Found employees:', employees);

    // Transform data
    const membersByRole: MemberData = {
      clients: [],
      employees: []
    };

    // Process clients
    for (const client of clients) {
      if (!client.zen_users?.[0]) continue;
      
      const user = typedUsers.find(u => u.id === client.user_id);
      const clientProjects = user?.projects.map(p => ({
        id: p.project.id,
        name: p.project.name
      })) || [];

      membersByRole.clients.push({
        id: client.user_id,
        name: client.zen_users[0].name || 'Unknown User',
        email: client.zen_users[0].email,
        company: client.company,
        projects: clientProjects
      });
    }

    // Process employees
    for (const employee of employees) {
      if (!employee.zen_users?.[0]) continue;
      
      const user = typedUsers.find(u => u.id === employee.user_id);
      const employeeProjects = user?.projects.map(p => ({
        id: p.project.id,
        name: p.project.name
      })) || [];

      membersByRole.employees.push({
        id: employee.user_id,
        name: employee.zen_users[0].name || 'Unknown User',
        email: employee.zen_users[0].email,
        department: employee.department,
        projects: employeeProjects
      });
    }

    console.log('9. Final response:', membersByRole);

    return NextResponse.json(membersByRole);
  } catch (error) {
    console.error('Unexpected error in GET /api/members:', error);
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}