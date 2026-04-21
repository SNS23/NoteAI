import React, { useState, useEffect, useMemo } from 'react';
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
import { FileText, Sparkles, Download, Trash2, CheckCircle2, Clock, AlertCircle, Filter, Search, History, Eye, Users, Zap } from 'lucide-react';
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
  const [viewingItem, setViewingItem] = useState<ActionItem | null>(null);
  const [modalDescription, setModalDescription] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<ActionItem>>({});

  useEffect(() => {
    if (viewingItem) {
      setModalDescription(viewingItem.requirements || '');
    }
  }, [viewingItem?.id]); // Only reset when the item ID changes to avoid reset during local edits

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
    }, (error) => {
      console.error("History Subscription Error:", error);
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
    }, (error) => {
      console.error("Action Items Subscription Error:", error);
      toast.error("Failed to sync action items");
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
      console.error('Analysis Error Detail:', error);
      toast.error(`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

  const handleUpdateItem = async (id: string, updates: Partial<ActionItem>) => {
    try {
      await updateDoc(doc(db, 'actionItems', id), updates);
      toast.success('Item updated');
      setEditingId(null);
      // We don't update viewingItem here to prevent the state-refresh reopening bug
    } catch (error) {
      toast.error('Failed to update item');
    }
  };

  const saveModalDescription = async () => {
    if (!viewingItem) return;
    await handleUpdateItem(viewingItem.id, { requirements: modalDescription });
    setViewingItem({ ...viewingItem, requirements: modalDescription });
  };

  const startEditing = (item: ActionItem) => {
    setEditingId(item.id);
    setEditFormData(item);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditFormData({});
  };

  const deleteItem = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'actionItems', id));
      toast.success('Item removed');
    } catch (error) {
      toast.error('Delete failed');
    }
  };

  const filteredItems = items.filter(item => 
    (item.workStream?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    (item.owner?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    (item.responsible?.toLowerCase() || '').includes(searchQuery.toLowerCase())
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
    const colorMap = {
      low: 'bg-blue-100 text-blue-700 border-blue-200',
      medium: 'bg-amber-100 text-amber-700 border-amber-200',
      high: 'bg-red-100 text-red-700 border-red-200'
    };
    return (
      <Badge variant="outline" className={`capitalize ${colorMap[priority as keyof typeof colorMap] || ''}`}>
        {priority}
      </Badge>
    );
  };

  const groupedItems = useMemo(() => {
    const filtered = filteredItems.filter(item => {
      if (searchQuery.startsWith('note:')) {
        const noteId = searchQuery.split(':')[1];
        return item.sourceNoteId === noteId;
      }
      return true;
    });

    const groups: Record<string, ActionItem[]> = {};
    filtered.forEach(item => {
      const epic = item.epic || 'Uncategorized Functionality';
      if (!groups[epic]) groups[epic] = [];
      groups[epic].push(item);
    });
    return groups;
  }, [filteredItems, searchQuery]);

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
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                  <DialogHeader>
                    <DialogTitle>Meeting Notes History</DialogTitle>
                    <DialogDescription>
                      Review the last 10 versions of notes for this project
                    </DialogDescription>
                  </DialogHeader>
                  <ScrollArea className="flex-1 pr-4 -mr-4">
                    <div className="space-y-4 py-4 pr-4">
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

            <ScrollArea className="h-[500px] w-full rounded-md border border-slate-100">
              <Table className="min-w-full table-fixed text-xs sm:text-sm">
                <TableHeader className="bg-slate-50 sticky top-0 z-10">
                  <TableRow>
                    <TableHead className="w-[25%] min-w-[150px]">Work Stream</TableHead>
                    <TableHead className="w-[15%] min-w-[100px]">Category</TableHead>
                    <TableHead className="w-[15%] min-w-[100px]">Owner</TableHead>
                    <TableHead className="w-[10%] min-w-[80px]">Priority</TableHead>
                    <TableHead className="w-[10%] min-w-[90px]">Due Date</TableHead>
                    <TableHead className="w-[15%] min-w-[120px]">Status</TableHead>
                    <TableHead className="w-[10%] min-w-[80px] text-right">Edit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(groupedItems).map(([epic, epicItems]) => (
                    <React.Fragment key={epic}>
                      <TableRow className="bg-slate-50/50 hover:bg-slate-50/50 border-y border-slate-200">
                        <TableCell colSpan={7} className="py-2">
                          <div className="flex items-center gap-2">
                            <Zap size={14} className="text-primary" />
                            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                              Functionality: {epic}
                            </span>
                            <Badge variant="secondary" className="text-[10px] h-4 px-1.5 bg-primary/10 text-primary border-none">
                              {(epicItems as ActionItem[]).length}
                            </Badge>
                          </div>
                        </TableCell>
                      </TableRow>
                      {(epicItems as ActionItem[]).map((item) => (
                        <TableRow 
                          key={item.id} 
                          className={`group transition-colors ${editingId === item.id ? 'bg-primary/5' : 'hover:bg-slate-50/80 cursor-pointer'}`}
                          onClick={() => editingId !== item.id && setViewingItem(item)}
                        >
                          <TableCell>
                            {editingId === item.id ? (
                              <Input 
                                value={editFormData.workStream || ''} 
                                onChange={(e) => setEditFormData({ ...editFormData, workStream: e.target.value })}
                                className="h-8 text-xs sm:text-sm"
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              <div className="font-medium text-slate-900 truncate" title={item.workStream}>
                                {item.workStream}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px] font-normal border-slate-200 bg-slate-50 whitespace-nowrap">
                              {item.category || 'N/A'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {editingId === item.id ? (
                              <Input 
                                value={editFormData.owner || ''} 
                                onChange={(e) => setEditFormData({ ...editFormData, owner: e.target.value })}
                                className="h-8 text-xs sm:text-sm"
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              <div className="text-xs sm:text-sm text-slate-600 truncate">{item.owner}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            {getPriorityBadge(item.priority)}
                          </TableCell>
                          <TableCell>
                            {editingId === item.id ? (
                              <Input 
                                type="text"
                                value={editFormData.dueDate || ''} 
                                onChange={(e) => setEditFormData({ ...editFormData, dueDate: e.target.value })}
                                className="h-8 text-xs sm:text-sm"
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              <div className="text-[10px] sm:text-xs text-slate-500 whitespace-nowrap">{item.dueDate}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div onClick={(e) => e.stopPropagation()}>
                              <Select 
                                value={editingId === item.id ? editFormData.status : item.status} 
                                onValueChange={(v) => editingId === item.id ? setEditFormData({ ...editFormData, status: v as any }) : updateStatus(item.id, v)}
                              >
                                <SelectTrigger className="h-8 w-full border-slate-200 bg-white/50 px-2 focus:ring-primary/20">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {STATUS_OPTIONS.map(opt => (
                                    <SelectItem key={opt.value} value={opt.value}>
                                      <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${opt.color}`} />
                                        <span className="text-[10px] sm:text-xs">{opt.label}</span>
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                              {editingId === item.id ? (
                                <>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-7 px-2 text-[10px] text-primary"
                                    onClick={() => handleUpdateItem(item.id, editFormData)}
                                  >
                                    Save
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-7 px-2 text-[10px] text-slate-500"
                                    onClick={cancelEditing}
                                  >
                                    Cancel
                                  </Button>
                                </>
                              ) : (
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => startEditing(item)}
                                  className="h-8 w-8 text-slate-400 hover:text-primary"
                                >
                                  <Filter className="rotate-90" size={14} />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </React.Fragment>
                  ))}
                  {Object.keys(groupedItems).length === 0 && (
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

      <Dialog open={!!viewingItem} onOpenChange={(open) => !open && setViewingItem(null)}>
        <DialogContent className="max-w-xl max-h-[85vh] p-0 flex flex-col overflow-hidden bg-white shadow-2xl border-none border-0 ring-0">
          <div className="p-6 bg-slate-50 border-b border-slate-200">
            <DialogHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <DialogTitle className="text-2xl font-bold tracking-tight text-slate-900">
                    {viewingItem?.workStream}
                  </DialogTitle>
                  <p className="text-sm text-slate-500">
                    Review and edit description
                  </p>
                </div>
                {viewingItem && getPriorityBadge(viewingItem.priority)}
              </div>
            </DialogHeader>
          </div>
          
          <ScrollArea className="flex-1 overflow-y-auto">
            <div className="p-6 space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] font-bold uppercase tracking-widest text-primary/70">
                    Requirement & Detail Description
                  </Label>
                </div>
                <div className="relative">
                  <textarea
                    className="w-full min-h-[350px] p-4 text-sm leading-relaxed text-slate-700 bg-white border border-slate-200 rounded-xl shadow-inner focus:ring-2 focus:ring-primary/10 focus:border-primary/30 transition-all resize-none font-sans"
                    value={modalDescription}
                    onChange={(e) => setModalDescription(e.target.value)}
                    placeholder="Enter detailed description here..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
                <div className="space-y-1 text-slate-500">
                  <span className="block text-[9px] uppercase tracking-wider font-bold text-slate-400">Functionality / Epic</span>
                  <span className="text-xs font-semibold text-slate-700">{viewingItem?.epic || 'Uncategorized'}</span>
                </div>
                <div className="space-y-1 text-slate-500">
                  <span className="block text-[9px] uppercase tracking-wider font-bold text-slate-400">Category</span>
                  <Badge variant="secondary" className="text-[9px] h-5 bg-slate-100 text-slate-600 border-none font-medium">
                    {viewingItem?.category}
                  </Badge>
                </div>
                <div className="space-y-1 text-slate-500">
                  <span className="block text-[9px] uppercase tracking-wider font-bold text-slate-400">Owner</span>
                  <span className="text-xs font-semibold text-slate-700">{viewingItem?.owner}</span>
                </div>
                <div className="space-y-1 text-slate-500">
                  <span className="block text-[9px] uppercase tracking-wider font-bold text-slate-400">Due Date</span>
                  <span className="text-xs font-semibold text-slate-700">{viewingItem?.dueDate}</span>
                </div>
              </div>
            </div>
          </ScrollArea>
          
          <CardFooter className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
            {modalDescription !== (viewingItem?.requirements || '') && (
              <Button size="sm" onClick={saveModalDescription} className="gap-2">
                <CheckCircle2 size={14} />
                Save Changes
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setViewingItem(null)}>
              Close Review
            </Button>
          </CardFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewingNote} onOpenChange={(open) => !open && setViewingNote(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
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
