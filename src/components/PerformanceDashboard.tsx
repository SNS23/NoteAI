import React, { useMemo, useEffect, useState } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { ActionItem, Project } from '../types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { TrendingUp, CheckCircle2, Target, Zap, Users } from 'lucide-react';

interface PerformanceDashboardProps {
  projects: Project[];
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

export default function PerformanceDashboard({ projects }: PerformanceDashboardProps) {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');

  useEffect(() => {
    const q = collection(db, 'actionItems');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActionItem)));
    }, (error) => {
      console.error("Dashboard Items Subscription Error:", error);
    });
    return () => unsubscribe();
  }, []);

  const filteredItems = useMemo(() => {
    if (selectedProjectId === 'all') return items;
    return items.filter(item => item.projectId === selectedProjectId);
  }, [items, selectedProjectId]);

  const stats = useMemo(() => {
    const total = filteredItems.length;
    const completed = filteredItems.filter(i => i.status === 'completed').length;
    const pending = filteredItems.filter(i => i.status === 'pending').length;
    const inProgress = filteredItems.filter(i => i.status === 'in-progress').length;
    const blocked = filteredItems.filter(i => i.status === 'blocked').length;

    const deliveryRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    return { total, completed, pending, inProgress, blocked, deliveryRate };
  }, [filteredItems]);

  const statusData = [
    { name: 'Completed', value: stats.completed },
    { name: 'In Progress', value: stats.inProgress },
    { name: 'Pending', value: stats.pending },
    { name: 'Blocked', value: stats.blocked },
  ].filter(d => d.value > 0);

  const ownerData = useMemo(() => {
    const counts: Record<string, { name: string, completed: number, total: number }> = {};
    filteredItems.forEach(item => {
      if (!counts[item.owner]) {
        counts[item.owner] = { name: item.owner, completed: 0, total: 0 };
      }
      counts[item.owner].total += 1;
      if (item.status === 'completed') counts[item.owner].completed += 1;
    });
    return Object.values(counts).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [filteredItems]);

  const categoryData = useMemo(() => {
    const counts: Record<string, { name: string, total: number, completed: number }> = {};
    filteredItems.forEach(item => {
      const cat = item.category || 'Uncategorized';
      if (!counts[cat]) {
        counts[cat] = { name: cat, total: 0, completed: 0 };
      }
      counts[cat].total += 1;
      if (item.status === 'completed') counts[cat].completed += 1;
    });
    return Object.values(counts).sort((a, b) => b.total - a.total);
  }, [filteredItems]);

  const epicData = useMemo(() => {
    const counts: Record<string, { name: string, total: number, completed: number }> = {};
    filteredItems.forEach(item => {
      const epic = item.epic || 'Uncategorized';
      if (!counts[epic]) {
        counts[epic] = { name: epic, total: 0, completed: 0 };
      }
      counts[epic].total += 1;
      if (item.status === 'completed') counts[epic].completed += 1;
    });
    return Object.values(counts).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [filteredItems]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Performance Analytics</h2>
        <div className="w-[200px]">
          <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
            <SelectTrigger className="bg-white">
              <SelectValue placeholder="Filter by Project">
                {selectedProjectId === 'all' ? 'All Projects' : projects.find(p => p.id === selectedProjectId)?.name}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {projects.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Actions</CardTitle>
            <Target className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-slate-500">Across {epicData.length} Workstreams</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Delivery Rate</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.deliveryRate}%</div>
            <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2">
              <div 
                className="bg-green-500 h-1.5 rounded-full" 
                style={{ width: `${stats.deliveryRate}%` }}
              />
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top Category</CardTitle>
            <Zap className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold truncate">{categoryData[0]?.name || 'N/A'}</div>
            <p className="text-xs text-slate-500">{categoryData[0]?.total || 0} active items</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Team Scale</CardTitle>
            <Users className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{ownerData.length}</div>
            <p className="text-xs text-slate-500">Active contributors</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>Status Distribution</CardTitle>
            <CardDescription>Breakdown of action items by current status</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-4 mt-4">
              {statusData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-xs text-slate-600">{d.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>Category Distribution</CardTitle>
            <CardDescription>Tasks grouped by nature of work</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                <XAxis type="number" fontSize={10} hide />
                <YAxis dataKey="name" type="category" fontSize={10} width={150} tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="total" name="Total Actions" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>Epic Progress</CardTitle>
            <CardDescription>Top functionalities completion status</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={epicData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis 
                  dataKey="name" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false} 
                  interval={0}
                  height={60}
                  textAnchor="end"
                  angle={-45}
                />
                <YAxis fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="total" name="Total" fill="#e2e8f0" radius={[4, 4, 0, 0]} />
                <Bar dataKey="completed" name="Completed" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>Top Owners Performance</CardTitle>
            <CardDescription>Committed vs Delivered by team member</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ownerData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis 
                  dataKey="name" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  interval={0}
                  height={60}
                  textAnchor="end"
                  angle={-45}
                />
                <YAxis fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="total" name="Committed" fill="#e2e8f0" radius={[4, 4, 0, 0]} />
                <Bar dataKey="completed" name="Delivered" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
