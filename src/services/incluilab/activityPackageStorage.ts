import type {
  ActivityPackage,
  ActivityPackageExportSettings,
  ActivityPackageMetadata,
  ActivitySchema,
} from '../../types';
import { validateActivitySchema } from '../../utils/validateActivitySchema';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function buildCanonicalActivityStorageContent(pkg: ActivityPackage): Record<string, unknown> {
  return {
    ...pkg.activity,
    metadata: pkg.metadata,
    exportSettings: pkg.exportSettings,
  };
}

export function parseStoredActivityFromPayload(contentJson: unknown, content?: string | null): ActivitySchema | null {
  for (const candidate of [contentJson, content]) {
    if (candidate == null) continue;
    try {
      const parsed = validateActivitySchema(candidate);
      if (parsed.schemaVersion === '2.0') return parsed;
      if (candidate === content) return parsed;
    } catch {
      // Tenta o próximo formato persistido.
    }
  }
  return null;
}

export function buildActivityPackageFromStoredRow(activity: ActivitySchema | undefined, rawContentJson: unknown): ActivityPackage | undefined {
  if (!activity || activity.schemaVersion !== '2.0') return undefined;

  const raw = isPlainObject(rawContentJson) ? rawContentJson : {};
  const metadata: ActivityPackageMetadata = isPlainObject(raw.metadata)
    ? raw.metadata as unknown as ActivityPackageMetadata
    : {
        schemaVersion: '2.0',
        requestType: activity.requestType ?? 'atividade',
        generatedAt: new Date().toISOString(),
        repairAttempts: 0,
        visualMode: 'none',
        visualModeSource: 'inferred_default',
        studentContextUsed: false,
      };
  const exportSettings: ActivityPackageExportSettings = isPlainObject(raw.exportSettings)
    ? raw.exportSettings as unknown as ActivityPackageExportSettings
    : { pageSize: 'A4', visualStyle: 'fundamental' };

  return {
    activity,
    teacherGuide: activity.requestType === 'adaptacao' ? activity.guia_pedagogico : undefined,
    answerKey: activity.answerKey,
    visualAssets: activity.visualAssets,
    metadata,
    exportSettings,
  };
}
