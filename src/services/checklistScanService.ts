// services/checklistScanService.ts
// Leitura com IA de checklists ENEM-like (códigos padronizados).
// Diferente do OCR genérico: o prompt usa os códigos para identificação precisa.

import { callAIGateway } from './aiGatewayService';
import { cleanJsonString } from './aiService';
import { AI_CREDIT_COSTS } from '../config/aiCosts';
import {
  buildScanPrompt,
  codesToRegenteData,
  codesToCuidadoraData,
  REGENTE_CODE_MAP,
  CUIDADORA_CODE_MAP,
} from './checklistSheetService';
import type { ChecklistRegenteData } from '../components/ChecklistRegenteForm';
import type { ChecklistCuidadoraData } from '../components/ChecklistCuidadoraForm';

// ─── Tipos ─────────────────────────────────────────────────────────────────────

export type ChecklistType = 'checklist_regente' | 'checklist_cuidadora';

export interface ScanRawResult {
  checklistType: ChecklistType;
  schemaVersion: string;
  studentCode: string | null;
  markedCodes: string[];
  uncertainCodes: string[];
  extraFields: Record<string, string>;
  freeNotes: string;
  overallConfidence: number;
}

export interface ChecklistScanResult {
  raw: ScanRawResult;
  regenteData?: Partial<ChecklistRegenteData>;
  cuidadoraData?: Partial<ChecklistCuidadoraData>;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function filterValidCodes(codes: unknown, type: ChecklistType): string[] {
  if (!Array.isArray(codes)) return [];
  const validMap = type === 'checklist_regente' ? REGENTE_CODE_MAP : CUIDADORA_CODE_MAP;
  return (codes as string[]).filter(c => typeof c === 'string' && c in validMap);
}

// ─── Leitura principal ─────────────────────────────────────────────────────────

export async function scanChecklistSheet(
  imageBase64: string,
  checklistType: ChecklistType,
): Promise<ChecklistScanResult> {
  const { result } = await callAIGateway({
    task:            'json',
    prompt:          buildScanPrompt(checklistType),
    imageBase64,
    creditsRequired: AI_CREDIT_COSTS.ANALISE_DOCUMENTO,
    requestType:     'checklist_scan_enem',
  });

  let raw: ScanRawResult;
  try {
    raw = JSON.parse(cleanJsonString(result)) as ScanRawResult;
  } catch {
    throw new Error('A IA não retornou um formato válido. Tente novamente com uma imagem mais nítida.');
  }

  // Sanitiza: remove códigos que a IA inventou
  raw.markedCodes    = filterValidCodes(raw.markedCodes,    checklistType);
  raw.uncertainCodes = filterValidCodes(raw.uncertainCodes, checklistType);
  raw.extraFields    = (raw.extraFields && typeof raw.extraFields === 'object') ? raw.extraFields : {};
  raw.freeNotes      = typeof raw.freeNotes === 'string' ? raw.freeNotes : '';
  raw.overallConfidence = typeof raw.overallConfidence === 'number'
    ? Math.max(0, Math.min(1, raw.overallConfidence))
    : 0.5;

  if (checklistType === 'checklist_regente') {
    return {
      raw,
      regenteData: codesToRegenteData(raw.markedCodes, raw.extraFields, raw.freeNotes),
    };
  }

  return {
    raw,
    cuidadoraData: codesToCuidadoraData(raw.markedCodes, raw.extraFields, raw.freeNotes),
  };
}
