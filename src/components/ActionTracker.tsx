import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, onSnapshot, query, where, updateDoc, doc, deleteDoc, orderBy } from 'firebase/firestore';
import { ActionItem, Project, MeetingNote } from '../types';
import { analyzeMeetingNotes } from '../lib/gemini';
import { exportActionItemsToPDF } from '../lib/pdf';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { toast } from 'sonner';
import { FileText, Sparkles, Download, Trash2, CheckCircle2, Clock, AlertCircle, Filter, Search, History, Eye } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { STATUS_OPTIONS, PRIORITY_OPTIONS } from '../constants';
import { format } from 'date-fns';
import { limit } from 'firebase/firestore';

interface ActionTrackerProps {
  projects: Project[];
}

export default function ActionTracker({ projects }: ActionTrackerProps) {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [notes, setNotes] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [history, setHistory] = useState<(MeetingNote & { userName?: string })[]>([]);
  const [viewingNote, setViewingNote] = useState<(MeetingNote & { userName?: string }) | null>(null);

  useEffect(() => {
    if (selectedProjectId === 'all') {
      setHistory([]);
      return;
    }
    const q = query(
      collection(db, 'meetingNotes'), 
      where('projectId', '==', selectedProjectId),
      orderBy('analyzedAt', 'desc'),
      limit(10)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
    });
    return () => unsubscribe();
  }, [selectedProjectId]);

  useEffect(() => {
    let q = query(collection(db, 'actionItems'), orderBy('createdAt', 'desc'));
    if (selectedProjectId !== 'all') {
      q = query(collection(db, 'actionItems'), where('projectId', '==', selectedProjectId), orderBy('createdAt', 'desc'));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActionItem)));
    });
    return () => unsubscribe();
  }, [selectedProjectId]);

  const handleAnalyze = async () => {
    if (!notes.trim()) {
      toast.error('Please enter some notes to analyze');
      return;
    }
    if (selectedProjectId === 'all') {
      toast.error('Please select a specific project for these notes');
      return;
    }

    setAnalyzing(true);
    try {
      const { additions, updates } = await analyzeMeetingNotes(notes, selectedProjectId, items);
      
      // Save notes to history
      const noteRef = await addDoc(collection(db, 'meetingNotes'), {
        projectId: selectedProjectId,
        content: notes,
        analyzedAt: Date.now(),
        userId: auth.currentUser?.uid,
        userName: auth.currentUser?.displayName || auth.currentUser?.email
      });

      // Handle additions
      for (const item of additions) {
        await addDoc(collection(db, 'actionItems'), {
          ...item,
          sourceNoteId: noteRef.id
        });
      }

      // Handle updates
      for (const update of updates) {
        await updateDoc(doc(db, 'actionItems', update.id), {
          ...update.updates,
          lastUpdatedFromNoteId: noteRef.id
        });
      }

      toast.success(`Analysis complete: ${additions.length} new items, ${updates.length} updates`);
      setNotes('');
    } catch (error) {
      toast.error('Analysis failed. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await updateDoc(doc(db, 'actionItems', id), { status });
      toast.success('Status updated');
    } catch (error) {
      toast.error('Update failed');
    }
  };

  const deleteItem = async (id: string) => {
    if (!confirm('Delete this action item?')) return;
    try {
      await deleteDoc(doc(db, 'actionItems', id));
      toast.success('Item removed');
    } catch (error) {
      toast.error('Delete failed');
    }
  };

  const filteredItems = items.filter(item => 
    item.workStream.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.owner.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.responsible.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    const option = STATUS_OPTIONS.find(o => o.value === status);
    return (
      <Badge className={`${option?.color} text-white hover:${option?.color}`}>
        {option?.label}
      </Badge>
    );
  };

  const getPriorityBadge = (priority: string) => {
    const option = PRIORITY_OPTIONS.find(o => o.value === priority);
    return (
      <Badge variant="outline" className="capitalize">
        {priority}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1 border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="text-primary" size={20} />
              Meeting Notes
            </CardTitle>
            <CardDescription>Paste facilitator or meeting notes here</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Target Project</Label>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select project">
                    {selectedProjectId === 'all' ? 'All Projects' : projects.find(p => p.id === selectedProjectId)?.name}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  {projects.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes Content</Label>
              <textarea 
                className="w-full min-h-[300px] p-3 rounded-md border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                placeholder="Paste your meeting notes here..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button 
              className="w-full gap-2" 
              onClick={handleAnalyze} 
              disabled={analyzing || selectedProjectId === 'all'}
            >
              {analyzing ? (
                <>
                  <Sparkles className="animate-pulse" size={18} />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  Extract Action Items
                </>
              )}
            </Button>
          </CardFooter>
        </Card>

        <Card className="lg:col-span-2 border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="text-primary" size={20} />
                Action Items Tracker
              </CardTitle>
              <CardDescription>Real-time view of all extracted tasks</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Dialog>
                <DialogTrigger render={<Button variant="outline" size="sm" className="gap-2" disabled={selectedProjectId === 'all'} />}>
                  <History size={16} />
                  Version History
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                  <DialogHeader>
                    <DialogTitle>Meeting Notes History</DialogTitle>
                    <DialogDescription>
                      Review the last 10 versions of notes for this project
                    </DialogDescription>
                  </DialogHeader>
                  <ScrollArea className="flex-1 pr-4">
                    <div className="space-y-4 py-4">
                      {history.map((note) => (
                        <Card key={note.id} className="border-slate-100 shadow-none hover:border-primary/30 transition-colors">
                          <CardHeader className="p-4 pb-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 text-sm font-medium">
                                <FileText size={14} className="text-slate-400" />
                                {format(note.analyzedAt, 'MMM dd, yyyy HH:mm')}
                              </div>
                              <Badge variant="secondary" className="text-[10px]">
                                {note.userName || 'Unknown'}
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="p-4 pt-0">
                            <p className="text-xs text-slate-500 line-clamp-2 mb-3">
                              {note.content}
                            </p>
                            <div className="flex gap-2">
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-7 text-[10px] gap-1"
                                onClick={() => setViewingNote(note)}
                              >
                                <Eye size={12} />
                                View Full Notes
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-7 text-[10px] gap-1"
                                onClick={() => {
                                  setSearchQuery(`note:${note.id}`);
                                  toast.info('Filtering tracker by this version');
                                }}
                              >
                                <Filter size={12} />
                                Filter Tracker
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                      {history.length === 0 && (
                        <div className="text-center py-8 text-slate-400 text-sm">
                          No history found for this project.
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </DialogContent>
              </Dialog>

              <Button 
                variant="outline" 
                size="sm" 
                className="gap-2"
                onClick={() => exportActionItemsToPDF(items, projects.find(p => p.id === selectedProjectId))}
              >
                <Download size={16} />
                Export PDF
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input 
                  placeholder="Search by owner, responsible, or workstream..." 
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              {searchQuery.startsWith('note:') && (
                <Button variant="ghost" size="sm" onClick={() => setSearchQuery('')} className="text-xs">
                  Clear Filter
                </Button>
              )}
            </div>

            <ScrollArea className="h-[500px] rounded-md border border-slate-100">
              <Table>
                <TableHeader className="bg-slate-50 sticky top-0 z-10">
                  <TableRow>
                    <TableHead className="w-[200px]">Work Stream</TableHead>
                    <TableHead>Owner / Resp.</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.filter(item => {
                    if (searchQuery.startsWith('note:')) {
                      const noteId = searchQuery.split(':')[1];
                      return item.sourceNoteId === noteId;
                    }
                    return true;
                  }).map((item) => (
                    <TableRow key={item.id} className="group">
                      <TableCell>
                        <div className="font-medium text-slate-900">{item.workStream}</div>
                        <div className="text-xs text-slate-500 truncate max-w-[180px]">{item.requirements}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{item.owner}</div>
                        <div className="text-xs text-slate-500 italic">Resp: {item.responsible}</div>
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {item.dueDate}
                      </TableCell>
                      <TableCell>
                        <Select value={item.status} onValueChange={(v) => updateStatus(item.id, v)}>
                          <SelectTrigger className="h-8 w-[130px] border-none bg-transparent p-0 focus:ring-0">
                            <SelectValue>{getStatusBadge(item.status)}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>
                                <div className="flex items-center gap-2">
                                  <div className={`w-2 h-2 rounded-full ${opt.color}`} />
                                  {opt.label}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => deleteItem(item.id)}
                          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-opacity"
                        >
                          <Trash2 size={16} />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-slate-400">
                        <AlertCircle className="mx-auto mb-2 opacity-20" size={48} />
                        <p>No action items found matching your criteria.</p>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!viewingNote} onOpenChange={(open) => !open && setViewingNote(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Meeting Notes Content</DialogTitle>
            <DialogDescription>
              Added by {viewingNote?.userName} on {viewingNote && format(viewingNote.analyzedAt, 'PPP p')}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 mt-4 p-4 rounded-md bg-slate-50 border border-slate-100">
            <pre className="text-sm font-sans whitespace-pre-wrap text-slate-700">
              {viewingNote?.content}
            </pre>
          </ScrollArea>
          <div className="flex justify-end mt-4">
            <Button onClick={() => setViewingNote(null)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
