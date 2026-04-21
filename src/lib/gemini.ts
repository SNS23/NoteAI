import { Type } from "@google/genai";
import { ActionItem, ActionCategory, Project } from "../types";
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
    3. Categorize NEW items into exactly one of these specific categories. Use these definitions for mapping:
       - "documentation": Wiki, confluence, documentation updates, BRD, user guides, or manual writing.
       - "AI code change": Generative AI integration, LLM prompt engineering, AI agent logic, or vector database work.
       - "ML code change": Model training, data preprocessing for ML, evaluation scripts, or traditional ML algorithms.
       - "BE code change": Backend logic, API development, database schema changes, or server-side scripts.
       - "FE code change": UI components, styling, React/Vue logic, or client-side interactions.
       - "design change": UX/UI wireframes, mocks, assets, or visual design refinements.
       - "architecture change": System design, pattern updates, high-level structural decisions, or tech stack changes.
       - "testing": QA activities, unit/integration test writing, automated tests, or bug fixes identified by QA.
       - "requirement clarification": Asking stakeholders for info, refining user stories, or clarifying business logic.
       - "infrastructure change - DEVOPS": CI/CD pipelines, hosting, cloud resources, networking, or general automation.
       - "infrastructure change - ML OPS": ML-specific pipelines, GPU provisioning, model serving infra, or dataset versioning.
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
    - workStream (short title), epic (functionality group), category (EXACTLY from list above), owner, responsible, informed, requirements, priority (low/medium/high), nextSteps.

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
            category: { 
              type: Type.STRING,
              enum: [
                "documentation", 
                "AI code change", 
                "ML code change", 
                "BE code change", 
                "FE code change", 
                "design change", 
                "architecture change", 
                "testing", 
                "requirement clarification", 
                "infrastructure change - DEVOPS", 
                "infrastructure change - ML OPS"
              ]
            },
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
                category: { 
                  type: Type.STRING,
                  enum: [
                    "documentation", 
                    "AI code change", 
                    "ML code change", 
                    "BE code change", 
                    "FE code change", 
                    "design change", 
                    "architecture change", 
                    "testing", 
                    "requirement clarification", 
                    "infrastructure change - DEVOPS", 
                    "infrastructure change - ML OPS"
                  ]
                },
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
    throw new Error("Failed to process meeting notes.");
  }
}

export async function askTrackerAgent(
  question: string,
  project: Project,
  items: ActionItem[]
): Promise<string> {
  const context = items.map(i => ({
    title: i.workStream,
    epic: i.epic,
    cat: i.category,
    owner: i.owner,
    status: i.status,
    priority: i.priority,
    due: i.dueDate,
    details: i.requirements.substring(0, 100) + '...'
  }));

  const prompt = `
    You are the "Action Tracker Agent". You have access to the current action items for the project "${project.name}".
    
    Current Action Items Context:
    ${JSON.stringify(context, null, 2)}

    Categories and Definitions:
    - documentation: Documentation/Guides/BRD.
    - AI code change: Generative AI, LLMs, Agents.
    - ML code change: ML Models, training data.
    - BE code change: Backend, APIs, DB.
    - FE code change: Frontend, UI/UX implementation.
    - design change: Wireframes, mocks, visual design.
    - architecture change: System architecture, patterns.
    - testing: QA, testing, bug fixes.
    - requirement clarification: Stakeholder info, story refinements.
    - infrastructure change - DEVOPS: CI/CD, cloud setup.
    - infrastructure change - ML OPS: ML-specific infrastructure.

    User's Question: "${question}"

    Your task:
    Answer the user's question professionally based ONLY on the provided context. 
    If the question is about who is working on what, list the owners and their tasks.
    If the question is about project status, summarize completed vs pending tasks.
    Be concise but informative. Use markdown for lists and bold text for emphasis.
    If you don't know the answer or the context doesn't have it, say so politely.
    
    Respond with a professional summary.
  `;

  const schema = {
    type: Type.OBJECT,
    properties: {
      answer: { type: Type.STRING }
    },
    required: ["answer"]
  };

  try {
    const response = await callAI(prompt, schema);
    const result = JSON.parse(response.text);
    return result.answer;
  } catch (e) {
    console.error("Agent chat failed:", e);
    return "I'm sorry, I'm having trouble accessing the tracker data right now.";
  }
}
