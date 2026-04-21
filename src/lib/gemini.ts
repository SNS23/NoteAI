import { Type } from "@google/genai";
import { ActionItem, ActionCategory } from "../types";
import { callAI } from "./ai";

export interface AnalysisResult {
  additions: Partial<ActionItem>[];
  updates: { id: string; updates: Partial<ActionItem> }[];
}

export async function analyzeMeetingNotes(
  notes: string, 
  projectId: string, 
  existingItems: ActionItem[]
): Promise<AnalysisResult> {
  const existingContext = existingItems.map(item => ({
    id: item.id,
    workStream: item.workStream,
    epic: item.epic || 'Uncategorized',
    category: item.category || 'Uncategorized',
    owner: item.owner,
    status: item.status,
    requirements: item.requirements,
  }));

  const prompt = `
    Analyze the following meeting notes and compare them with the existing action items for this project.
    
    Existing Action Items:
    ${JSON.stringify(existingContext, null, 2)}

    New Meeting Notes:
    ${notes}

    Your task:
    1. Identify NEW action items mentioned in the notes.
    2. Group NEW items by "epic" or "functionality" (high-level grouping of related tasks).
    3. Categorize NEW items into one of these specific categories:
       - documentation
       - AI code change
       - ML code change
       - BE code change
       - FE code change
       - design change
       - architecture change
       - testing
       - requirement clarification
       - DevOps infrastructure
       - ML Ops infrastructure
    4. Identify UPDATES to existing action items. Pay close attention to:
       - STATUS CHANGES: If notes mention a task is "done", "finished", "started", "blocked", or "moving to in-progress", update the "status" field accordingly.
       - Requirement additions or progress updates.
       - Changes in ownership or due dates.
    
    Status mapping:
    - "done", "completed", "resolved" -> "completed"
    - "started", "in process", "doing" -> "in-progress"
    - "blocked", "stuck", "on hold" -> "blocked"
    - "new", "pending" -> "pending"
    
    For NEW items (additions), provide:
    - workStream (short title), epic (functionality group), category (from list above), owner, responsible, informed, requirements, priority (low/medium/high), nextSteps.

    Important: Do NOT provide dueDate for NEW items; it will be calculated automatically.

    For UPDATES, provide:
    - id: The ID of the existing item.
    - updates: An object containing ONLY the fields that have changed.

    Return the result as a JSON object with two arrays: "additions" and "updates".
  `;

  const schema = {
    type: Type.OBJECT,
    properties: {
      additions: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            workStream: { type: Type.STRING },
            epic: { type: Type.STRING },
            category: { type: Type.STRING },
            owner: { type: Type.STRING },
            responsible: { type: Type.STRING },
            informed: { type: Type.STRING },
            requirements: { type: Type.STRING },
            nextSteps: { type: Type.STRING },
            priority: { type: Type.STRING, enum: ["low", "medium", "high"] },
          },
          required: ["workStream", "epic", "category", "owner", "responsible", "requirements", "priority"],
        },
      },
      updates: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            updates: {
              type: Type.OBJECT,
              properties: {
                workStream: { type: Type.STRING },
                epic: { type: Type.STRING },
                category: { type: Type.STRING },
                owner: { type: Type.STRING },
                responsible: { type: Type.STRING },
                informed: { type: Type.STRING },
                requirements: { type: Type.STRING },
                nextSteps: { type: Type.STRING },
                status: { type: Type.STRING, enum: ["pending", "in-progress", "completed", "blocked"] },
                priority: { type: Type.STRING, enum: ["low", "medium", "high"] },
              }
            }
          },
          required: ["id", "updates"]
        }
      }
    },
    required: ["additions", "updates"]
  };

  console.log('Starting Multi-Model Analysis for project:', projectId);

  try {
    const response = await callAI(prompt, schema);
    const result = JSON.parse(response.text);
    
    const now = Date.now();
    const threeDaysInMs = 3 * 24 * 60 * 60 * 1000;
    const defaultDueDate = new Date(now + threeDaysInMs).toISOString().split('T')[0];

    const additions = result.additions.map((item: any) => ({
      workStream: item.workStream || 'Uncategorized',
      epic: item.epic || 'Uncategorized',
      category: (item.category as ActionCategory) || 'Uncategorized',
      owner: item.owner || 'TBD',
      responsible: item.responsible || 'TBD',
      informed: item.informed || '',
      dueDate: defaultDueDate,
      requirements: item.requirements || '',
      ticketRef: '',
      nextSteps: item.nextSteps || '',
      priority: item.priority || 'medium',
      projectId,
      status: 'pending',
      createdAt: now,
    }));

    return {
      additions,
      updates: result.updates
    };
  } catch (e) {
    console.error("AI Analysis failed:", e);
    throw new Error("Failed to process meeting notes. The AI model might be unavailable.");
  }
}
