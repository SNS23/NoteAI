import { GoogleGenAI, Type } from "@google/genai";

const geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export interface AIResponse {
  text: string;
}

export async function callAI(prompt: string, schema: any): Promise<AIResponse> {
  const ollamaUrl = import.meta.env.VITE_OLLAMA_BASE_URL || 'https://intranet.accionlabs.com/ollama';
  const defaultModel = import.meta.env.VITE_DEFAULT_MODEL || 'gemma3:1b';

  // Try Gemini first if it's the default or no Ollama URL provided
  if (!ollamaUrl || defaultModel.startsWith("gemini")) {
    try {
      return await callGemini(prompt, schema, defaultModel);
    } catch (error: any) {
      console.error("Gemini failed:", error);
      if (ollamaUrl) {
        console.log("Falling back to Ollama...");
        return await callOllama(prompt, schema);
      }
      throw error;
    }
  } else {
    // Try Ollama first
    try {
      return await callOllama(prompt, schema);
    } catch (error: any) {
      console.error("Ollama failed:", error);
      if (process.env.GEMINI_API_KEY) {
        console.log("Falling back to Gemini...");
        return await callGemini(prompt, schema, "gemini-3-flash-preview");
      }
      throw error;
    }
  }
}

async function callGemini(prompt: string, schema: any, modelName: string): Promise<AIResponse> {
  const response = await geminiClient.models.generateContent({
    model: modelName,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: schema,
    },
  });
  return { text: response.text };
}

async function callOllama(prompt: string, schema: any): Promise<AIResponse> {
  const ollamaUrl = import.meta.env.VITE_OLLAMA_BASE_URL || 'https://intranet.accionlabs.com/ollama';
  const defaultModel = import.meta.env.VITE_DEFAULT_MODEL || 'gemma3:1b';
  
  const fullPrompt = `${prompt}\n\nIMPORTANT: Return ONLY valid JSON that matches this schema: ${JSON.stringify(schema)}`;

  const response = await fetch(`${ollamaUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: defaultModel.startsWith('gemini') ? 'llama3' : defaultModel,
      prompt: fullPrompt,
      stream: false,
      format: "json"
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.statusText}`);
  }

  const result = await response.json();
  return { text: result.response };
}
