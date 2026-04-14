import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, addDoc, deleteDoc, doc, updateDoc, onSnapshot, query, where } from 'firebase/firestore';
import { Project, TeamMember, TeamRole } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toast } from 'sonner';
import { FolderPlus, Trash2, Users, Briefcase, UserPlus, X, Globe } from 'lucide-react';

interface ProjectManagementProps {
  projects: Project[];
}

const ROLES: TeamRole[] = [
  'Developer', 'Tester', 'DevOps', 'BA', 'Manager', 'Architect', 
  'Lead', 'Client', 'Business Stakeholder', 'Product Owner', 'Integration Lead'
];

export default function ProjectManagement({ projects }: ProjectManagementProps) {
  const [projectName, setProjectName] = useState('');
  const [projectDesc, setProjectDesc] = useState('');
  const [projectDomain, setProjectDomain] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<TeamRole>('Developer');

  useEffect(() => {
    if (!selectedProject) {
      setTeamMembers([]);
      return;
    }
    const q = query(collection(db, `projects/${selectedProject.id}/members`));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTeamMembers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TeamMember)));
    });
    return () => unsubscribe();
  }, [selectedProject]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await addDoc(collection(db, 'projects'), {
        name: projectName,
        description: projectDesc,
        domain: projectDomain,
        createdAt: Date.now(),
      });
      toast.success('Project created successfully');
      setProjectName('');
      setProjectDesc('');
      setProjectDomain('');
    } catch (error: any) {
      toast.error('Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this project? All associated data will be lost.')) return;
    try {
      await deleteDoc(doc(db, 'projects', id));
      toast.success('Project deleted');
    } catch (error) {
      toast.error('Failed to delete project');
    }
  };

  const handleAddTeamMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject) return;
    
    try {
      await addDoc(collection(db, `projects/${selectedProject.id}/members`), {
        name: newMemberName,
        role: newMemberRole,
        projectId: selectedProject.id
      });
      toast.success('Member added to project');
      setNewMemberName('');
      setNewMemberRole('Developer');
    } catch (error) {
      toast.error('Failed to add member');
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!selectedProject) return;
    try {
      await deleteDoc(doc(db, `projects/${selectedProject.id}/members`, memberId));
      toast.success('Member removed from project');
    } catch (error) {
      toast.error('Failed to remove member');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-1 border-slate-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderPlus className="text-primary" size={20} />
            Add Project
          </CardTitle>
          <CardDescription>Define a new project workstream</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateProject} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="proj-name">Project Name</Label>
              <Input 
                id="proj-name" 
                placeholder="e.g. Q2 Customer Success" 
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                required 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proj-domain">Domain</Label>
              <Input 
                id="proj-domain" 
                placeholder="e.g. Finance, Healthcare, Retail" 
                value={projectDomain}
                onChange={(e) => setProjectDomain(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proj-desc">Description</Label>
              <Input 
                id="proj-desc" 
                placeholder="Brief purpose of the project" 
                value={projectDesc}
                onChange={(e) => setProjectDesc(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating...' : 'Create Project'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2 border-slate-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="text-primary" size={20} />
            Active Projects
          </CardTitle>
          <CardDescription>List of all projects and their allocated teams</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project Name</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>
                    {p.domain ? (
                      <div className="flex items-center gap-1 text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full w-fit">
                        <Globe size={10} />
                        {p.domain}
                      </div>
                    ) : '-'}
                  </TableCell>
                  <TableCell className="text-slate-500 text-sm truncate max-w-[200px]">{p.description || '-'}</TableCell>
                  <TableCell className="text-right flex justify-end gap-2">
                    <Dialog open={selectedProject?.id === p.id} onOpenChange={(open) => !open && setSelectedProject(null)}>
                      <DialogTrigger render={<Button variant="ghost" size="icon" onClick={() => setSelectedProject(p)} className="text-blue-500 hover:text-blue-700 hover:bg-blue-50" />}>
                        <Users size={16} />
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>Manage Team: {p.name}</DialogTitle>
                          <DialogDescription>Allocate team members and assign project-specific roles</DialogDescription>
                        </DialogHeader>
                        
                        <div className="space-y-6 py-4">
                          <form onSubmit={handleAddTeamMember} className="space-y-4 bg-slate-50 p-4 rounded-lg border border-slate-100">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-1">
                                <Label className="text-xs">Name</Label>
                                <Input 
                                  placeholder="John Doe" 
                                  value={newMemberName}
                                  onChange={(e) => setNewMemberName(e.target.value)}
                                  required
                                  className="h-9"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Role</Label>
                                <Select value={newMemberRole} onValueChange={(v) => setNewMemberRole(v as TeamRole)}>
                                  <SelectTrigger className="h-9">
                                    <SelectValue placeholder="Select role" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {ROLES.map(role => (
                                      <SelectItem key={role} value={role}>{role}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <Button type="submit" size="sm" className="w-full gap-2">
                              <UserPlus size={14} />
                              Add Team Member
                            </Button>
                          </form>

                          <div className="space-y-2">
                            <Label className="text-sm font-semibold">Allocated Team Members</Label>
                            <div className="border rounded-md overflow-hidden">
                              <Table>
                                <TableHeader className="bg-slate-50">
                                  <TableRow>
                                    <TableHead className="h-9 text-xs">Name</TableHead>
                                    <TableHead className="h-9 text-xs">Role</TableHead>
                                    <TableHead className="h-9 text-xs text-right">Action</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {teamMembers.map(member => (
                                    <TableRow key={member.id}>
                                      <TableCell className="py-2 text-sm">{member.name}</TableCell>
                                      <TableCell className="py-2">
                                        <span className="text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary px-2 py-0.5 rounded">
                                          {member.role}
                                        </span>
                                      </TableCell>
                                      <TableCell className="py-2 text-right">
                                        <Button 
                                          variant="ghost" 
                                          size="icon" 
                                          className="h-7 w-7 text-slate-400 hover:text-red-500"
                                          onClick={() => handleRemoveMember(member.id)}
                                        >
                                          <X size={14} />
                                        </Button>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                  {teamMembers.length === 0 && (
                                    <TableRow>
                                      <TableCell colSpan={3} className="text-center py-8 text-xs text-slate-400">
                                        No team members assigned yet.
                                      </TableCell>
                                    </TableRow>
                                  )}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                    <Button variant="ghost" size="icon" onClick={() => handleDeleteProject(p.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                      <Trash2 size={16} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {projects.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-slate-400">
                    No projects found. Create one to get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
