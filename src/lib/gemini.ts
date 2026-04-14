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
    2. Identify UPDATES to existing action items (e.g., status changes, new requirements, changed owners, or progress mentioned in notes).
    
    For NEW items (additions), provide:
    - workStream, owner, responsible, informed, dueDate, requirements, ticketRef, nextSteps, priority (low/medium/high).

    For UPDATES, provide:
    - id: The ID of the existing item.
    - updates: An object containing ONLY the fields that have changed or been updated.

    Return the result as a JSON object with two arrays: "additions" and "updates".
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
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

  try {
    const result = JSON.parse(response.text);
    
    const additions = result.additions.map((item: any) => ({
      ...item,
      projectId,
      status: 'pending',
      createdAt: Date.now(),
    }));

    return {
      additions,
      updates: result.updates
    };
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    return { additions: [], updates: [] };
  }
}
