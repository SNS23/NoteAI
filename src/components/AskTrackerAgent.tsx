import React, { useState, useEffect, useRef } from 'react';
import { Project, ActionItem } from '../types';
import { askTrackerAgent } from '../lib/gemini';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';
import { MessageSquare, Send, Sparkles, Bot, User, Loader2, ListTodo } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';

interface AskTrackerAgentProps {
  projects: Project[];
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export default function AskTrackerAgent({ projects }: AskTrackerAgentProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [items, setItems] = useState<ActionItem[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedProjectId || selectedProjectId === 'all') return;

    const q = query(
      collection(db, 'actionItems'), 
      where('projectId', '==', selectedProjectId),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActionItem)));
    });

    return () => unsubscribe();
  }, [selectedProjectId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !selectedProjectId || selectedProjectId === 'all') {
      if (!selectedProjectId || selectedProjectId === 'all') {
        toast.error('Please select a project first');
      }
      return;
    }

    const project = projects.find(p => p.id === selectedProjectId);
    if (!project) return;

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await askTrackerAgent(input, project, items);
      const assistantMessage: Message = {
        role: 'assistant',
        content: response,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      toast.error('Failed to get a response from the agent');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-[calc(100vh-12rem)] flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Ask Tracker Agent</h2>
          <p className="text-sm text-slate-500">Intelligent chat to query and summarize project actions</p>
        </div>
        
        <div className="w-full sm:w-64">
          <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
            <SelectTrigger className="bg-white">
              <SelectValue placeholder="Select a project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map(p => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col lg:flex-row gap-6">
        <Card className="flex-1 flex flex-col border-slate-200 shadow-sm overflow-hidden bg-white">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-3 px-6">
            <div className="flex items-center gap-2">
              <Bot className="text-primary" size={20} />
              <CardTitle className="text-base">Agent Conversation</CardTitle>
            </div>
          </CardHeader>
          
          <ScrollArea ref={scrollRef} className="flex-1 p-6">
            <div className="space-y-6">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                  <div className="p-4 bg-primary/5 rounded-full">
                    <MessageSquare size={32} className="text-primary/40" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium text-slate-900">No messages yet</p>
                    <p className="text-sm text-slate-500 max-w-xs">
                      Select a project and ask a question like "Who is working on the high priority tasks?" or "Summarize the current blocking items."
                    </p>
                  </div>
                </div>
              ) : (
                messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`flex gap-3 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                      <div className={`mt-1 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                        msg.role === 'user' ? 'bg-slate-100' : 'bg-primary/10'
                      }`}>
                        {msg.role === 'user' ? <User size={16} className="text-slate-600" /> : <Sparkles size={16} className="text-primary" />}
                      </div>
                      <div className={`p-4 rounded-2xl shadow-sm ${
                        msg.role === 'user' 
                          ? 'bg-primary text-primary-foreground rounded-tr-none' 
                          : 'bg-white border border-slate-200 rounded-tl-none'
                      }`}>
                        <div className={`prose prose-sm max-w-none ${msg.role === 'user' ? 'text-primary-foreground prose-invert' : 'text-slate-700'}`}>
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
              {loading && (
                <div className="flex justify-start">
                  <div className="flex gap-3 items-center text-slate-400 text-sm italic">
                    <Loader2 size={16} className="animate-spin" />
                    Agent is thinking...
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <CardFooter className="p-4 bg-slate-50/50 border-t border-slate-100">
            <div className="flex w-full gap-2 relative">
              <Input
                placeholder={selectedProjectId ? "Ask about action items..." : "Please select a project first"}
                disabled={!selectedProjectId || loading}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                className="pr-12 bg-white"
              />
              <Button 
                size="icon" 
                onClick={handleSend} 
                disabled={!input.trim() || !selectedProjectId || loading}
                className="absolute right-1 top-1 bottom-1 h-auto"
              >
                <Send size={16} />
              </Button>
            </div>
          </CardFooter>
        </Card>

        <Card className="w-full lg:w-80 border-slate-200 shadow-sm flex flex-col bg-white">
          <CardHeader className="py-4 border-b border-slate-100">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <ListTodo size={16} />
              Active Context
            </CardTitle>
            <CardDescription className="text-[10px]">Reference for the agent</CardDescription>
          </CardHeader>
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-3">
              {items.length === 0 ? (
                <p className="text-xs text-slate-400 italic text-center py-4">No items for this project</p>
              ) : (
                items.slice(0, 5).map(item => (
                  <div key={item.id} className="p-2 bg-slate-50 rounded border border-slate-100 space-y-1">
                    <p className="text-[10px] font-bold text-slate-900 truncate">{item.workStream}</p>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[9px] text-slate-500 truncate">{item.owner}</span>
                      <Badge variant="outline" className={`text-[8px] h-4 px-1 ${
                        item.status === 'completed' ? 'bg-green-50 text-green-600 border-green-200' : 
                        item.status === 'blocked' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-slate-100'
                      }`}>
                        {item.status}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
              {items.length > 5 && (
                <p className="text-[10px] text-center text-slate-400">+{items.length - 5} more items</p>
              )}
            </div>
          </ScrollArea>
        </Card>
      </div>
    </div>
  );
}
