// geminiService.ts
import { AIService } from "./aiService";
import { ProtocolType, Student, User } from "../types";

// This file is now a facade for the new AIService that enforces credits.
// We keep it for backward compatibility if any component imports it directly.
export { AIService };

export const generateProtocolAI = async (
  type: ProtocolType,
  student: Student,
  user: User, 
  laudoBase64?: string
): Promise<string> => { 
  // The editor flow expects a structured JSON payload (sections/fields).
  // Returning plain text causes parsing issues and breaks the UI.
  // Note: laudoBase64 is currently unused in the JSON flow; if you want the laudo
  // to influence generation, we can extend generateProtocolJSON to accept it.
  return AIService.generateProtocolJSON(type, student, user);
};

export interface ActivityGenOptions {
  bnccCodes?: string[];
  discipline?: string;
  grade?: string;
  period?: string;
  teacherActivity?: boolean;
  imageBase64?: string;
}

export const generateActivityAI = async (
  topic: string,
  student: Student,
  user: User,
  options?: ActivityGenOptions | string
): Promise<string> => {
  // Backward-compatible: previous signature was (topic, student, user, activityImageBase64?)
  return AIService.generateActivity(topic, student, user, options as any);
};