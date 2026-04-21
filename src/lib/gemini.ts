import { GoogleGenAI, Type } from "@google/genai";
import { ActionItem } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
    owner: item.owner,
    status: item.status,
    requirements: item.requirements,
    ticketRef: item.ticketRef
  }));

  const prompt = `
    Analyze the following meeting notes and compare them with the existing action items for this project.
    
    Existing Action Items:
    ${JSON.stringify(existingContext, null, 2)}

    New Meeting Notes:
    ${notes}

    Your task:
    1. Identify NEW action items mentioned in the notes that are not in the existing list.
    2. Identify UPDATES to existing action items. Pay close attention to:
       - STATUS CHANGES: If notes mention a task is "done", "finished", "started", "blocked", or "moving to in-progress", update the "status" field accordingly.
       - Requirement additions or progress updates.
       - Changes in ownership or due dates.
    
    Status mapping:
    - "done", "completed", "resolved" -> "completed"
    - "started", "in process", "doing" -> "in-progress"
    - "blocked", "stuck", "on hold" -> "blocked"
    - "new", "pending" -> "pending"
    
    For NEW items (additions), provide:
    - workStream, owner, responsible, informed, dueDate, requirements, ticketRef, nextSteps, priority (low/medium/high).

    For UPDATES, provide:
    - id: The ID of the existing item.
    - updates: An object containing ONLY the fields that have changed or been updated.

    Return the result as a JSON object with two arrays: "additions" and "updates".
  `;

  console.log('Starting Gemini Analysis for project:', projectId);
  console.log('Existing items count:', existingItems.length);

  const maxRetries = 3;
  let retryCount = 0;

  async function executeWithRetry(): Promise<any> {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              additions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    workStream: { type: Type.STRING },
                    owner: { type: Type.STRING },
                    responsible: { type: Type.STRING },
                    informed: { type: Type.STRING },
                    dueDate: { type: Type.STRING },
                    requirements: { type: Type.STRING },
                    ticketRef: { type: Type.STRING },
                    nextSteps: { type: Type.STRING },
                    priority: { type: Type.STRING, enum: ["low", "medium", "high"] },
                  },
                  required: ["workStream", "owner", "responsible", "requirements", "priority"],
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
                        owner: { type: Type.STRING },
                        responsible: { type: Type.STRING },
                        informed: { type: Type.STRING },
                        dueDate: { type: Type.STRING },
                        requirements: { type: Type.STRING },
                        ticketRef: { type: Type.STRING },
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
          },
        },
      });
      return response;
    } catch (error: any) {
      if (error?.code === 429 || error?.status === "RESOURCE_EXHAUSTED") {
        if (retryCount < maxRetries) {
          retryCount++;
          const delay = Math.pow(2, retryCount) * 1000;
          console.log(`Rate limited. Retrying in ${delay}ms... (Attempt ${retryCount}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return executeWithRetry();
        }
      }
      throw error;
    }
  }

  const response = await executeWithRetry();

  console.log('Gemini Response received');

  try {
    const result = JSON.parse(response.text);
    console.log('Parsed result additions:', result.additions.length);
    console.log('Parsed result updates:', result.updates.length);
    
    const additions = result.additions.map((item: any) => ({
      workStream: item.workStream || 'Uncategorized',
      owner: item.owner || 'TBD',
      responsible: item.responsible || 'TBD',
      informed: item.informed || '',
      dueDate: item.dueDate || 'TBD',
      requirements: item.requirements || '',
      ticketRef: item.ticketRef || '',
      nextSteps: item.nextSteps || '',
      priority: item.priority || 'medium',
      projectId,
      status: 'pending',
      createdAt: Date.now(),
    }));

    return {
      additions,
      updates: result.updates
    };
  } catch (e) {
    console.error("Failed to parse Gemini response. Raw text:", response.text);
    throw new Error("Failed to parse AI response. Please check the console for details.");
  }
}
