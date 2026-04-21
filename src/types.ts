export type UserRole = 'admin' | 'regular';

export interface UserProfile {
  uid: string;
  email: string;
  role: UserRole;
  displayName?: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  domain?: string;
  createdAt: number;
}

export type TeamRole = 
  | 'Developer' 
  | 'Tester' 
  | 'DevOps' 
  | 'BA' 
  | 'Manager' 
  | 'Architect' 
  | 'Lead' 
  | 'Client' 
  | 'Business Stakeholder' 
  | 'Product Owner' 
  | 'Integration Lead';

export interface TeamMember {
  id: string;
  name: string;
  role: TeamRole;
  projectId: string;
}

export type ActionCategory = 
  | 'documentation'
  | 'AI code change'
  | 'ML code change'
  | 'BE code change'
  | 'FE code change'
  | 'design change'
  | 'architecture change'
  | 'testing'
  | 'requirement clarification'
  | 'DevOps infrastructure'
  | 'ML Ops infrastructure'
  | 'Uncategorized';

export interface ActionItem {
  id: string;
  projectId: string;
  workStream: string;
  epic: string;
  category: ActionCategory;
  owner: string;
  responsible: string;
  informed: string;
  createdAt: number;
  dueDate: string;
  requirements: string;
  ticketRef: string;
  status: 'pending' | 'in-progress' | 'completed' | 'blocked';
  nextSteps: string;
  sourceNoteId?: string;
  lastUpdatedFromNoteId?: string;
  priority: 'low' | 'medium' | 'high';
}

export interface MeetingNote {
  id: string;
  projectId: string;
  content: string;
  analyzedAt: number;
  userId: string;
}

export interface PerformanceMetrics {
  committed: number;
  delivered: number;
  quality: number; // 0-100
  productivity: number; // 0-100
  utilization: number; // 0-100
}
