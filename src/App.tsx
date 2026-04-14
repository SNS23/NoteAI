import React, { useState, useEffect } from 'react';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, getDoc, onSnapshot, collection, query, where } from 'firebase/firestore';
import { UserProfile, Project } from './types';
import Login from './components/Login';
import AdminPanel from './components/AdminPanel';
import ActionTracker from './components/ActionTracker';
import PerformanceDashboard from './components/PerformanceDashboard';
import ProjectManagement from './components/ProjectManagement';
import { Button } from './components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { LogOut, LayoutDashboard, ListTodo, Settings, Users, BarChart3 } from 'lucide-react';
import { Toaster } from './components/ui/sonner';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const docRef = doc(db, 'users', u.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as UserProfile;
          if (u.email?.toLowerCase() === 'sandeepit@gmail.com' && data.role !== 'admin') {
            data.role = 'admin';
            try {
              const { updateDoc } = await import('firebase/firestore');
              await updateDoc(docRef, { role: 'admin' });
            } catch (e) {
              console.error("Failed to update admin role", e);
            }
          }
          setProfile(data);
        } else if (u.email?.toLowerCase() === 'sandeepit@gmail.com') {
          // Bootstrap master admin profile if it doesn't exist
          const newProfile: UserProfile = {
            uid: u.uid,
            email: u.email,
            role: 'admin',
            displayName: 'Master Admin'
          };
          try {
            const { setDoc } = await import('firebase/firestore');
            await setDoc(docRef, newProfile);
            setProfile(newProfile);
          } catch (e) {
            console.error("Failed to bootstrap admin", e);
            // Fallback: set local profile so UI works
            setProfile(newProfile);
          }
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'projects'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const projs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
      setProjects(projs);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (user && profile) {
      console.log(`Current User: ${user.email}, Role: ${profile.role}`);
    }
  }, [user, profile]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <Login />
        <Toaster />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-primary text-primary-foreground p-1.5 rounded-lg">
              <ListTodo size={20} />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">ActionTracker AI</h1>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-slate-900">{profile?.displayName || user.email}</p>
              <p className="text-xs text-slate-500 capitalize">{profile?.role || 'User'}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => signOut(auth)}>
              <LogOut size={18} />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs defaultValue="tracker" className="space-y-6">
          <TabsList className="bg-white border border-slate-200 p-1">
            <TabsTrigger value="tracker" className="flex items-center gap-2">
              <ListTodo size={16} />
              Tracker
            </TabsTrigger>
            <TabsTrigger value="performance" className="flex items-center gap-2">
              <BarChart3 size={16} />
              Performance
            </TabsTrigger>
            {profile?.role === 'admin' && (
              <TabsTrigger value="projects" className="flex items-center gap-2">
                <LayoutDashboard size={16} />
                Projects
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="tracker" className="mt-0">
            <ActionTracker projects={projects} />
          </TabsContent>

          <TabsContent value="performance" className="mt-0">
            <PerformanceDashboard projects={projects} />
          </TabsContent>

          {profile?.role === 'admin' && (
            <TabsContent value="projects" className="mt-0">
              <ProjectManagement projects={projects} />
            </TabsContent>
          )}
        </Tabs>
      </main>
      <Toaster />
    </div>
  );
}
