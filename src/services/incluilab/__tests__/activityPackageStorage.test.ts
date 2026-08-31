import { describe, expect, it } from 'vitest';
import {
  buildActivityPackageFromStoredRow,
  buildCanonicalActivityStorageContent,
  parseStoredActivityFromPayload,
} from '../activityPackageStorage';
import type { ActivityPackage } from '../../../types';

function makePackage(baseText: string): ActivityPackage {
  return {
    activity: {
      schemaVersion: '2.0',
      requestType: 'atividade',
      header: { title: 'Água', theme: 'Ciências', objective: 'Compreender usos da água', instructions: [] },
      blocks: [{
        id: 'base-text-1',
        type: 'instructions',
        title: 'Texto introdutório',
        content: baseText,
        items: [],
        visualAssetIds: [],
      }],
      exercises: Array.from({ length: 15 }, (_, index) => ({
        id: `exercise-${index + 1}`,
        type: index < 10 ? 'short_answer' : 'multiple_choice',
        title: `Questão ${index + 1}`,
        prompt: `Questão relacionada ao texto ${index + 1}`,
        options: index < 10 ? [] : ['A', 'B', 'C', 'D'],
        answerLines: index < 10 ? 3 : 0,
      })),
      visualAssets: [],
      accessibilityNotes: { supports: [], adaptations: [], teacherNotes: [] },
    },
    visualAssets: [],
    metadata: {
      schemaVersion: '2.0',
      requestType: 'atividade',
      generatedAt: '2026-08-19T00:00:00.000Z',
      repairAttempts: 0,
      visualMode: 'none',
      visualModeSource: 'inferred_default',
      studentContextUsed: false,
    },
    exportSettings: { pageSize: 'A4', visualStyle: 'fundamental', outputFormat: 'docx' },
  };
}

describe('activityPackageStorage — round-trip canônico da Biblioteca', () => {
  it('preserva texto-base integralmente via content_json mesmo se content textual vier truncado/inútil', () => {
    const baseText = 'A água está presente nos rios, nas casas, nas plantas e no corpo humano. '.repeat(45).trim();
    const pkg = makePackage(baseText);
    const persistedContentJson = buildCanonicalActivityStorageContent(pkg);
    const reopened = parseStoredActivityFromPayload(persistedContentJson, '{"schemaVersion":"2.0","header":');
    const reopenedPackage = buildActivityPackageFromStoredRow(reopened ?? undefined, persistedContentJson);

    expect(reopened?.schemaVersion).toBe('2.0');
    expect(reopened?.blocks[0]?.id).toBe('base-text-1');
    expect(reopened?.blocks[0]?.content).toBe(baseText);
    expect(reopened?.exercises).toHaveLength(15);
    expect(reopenedPackage?.activity.blocks[0]?.content).toBe(baseText);
    expect(reopenedPackage?.exportSettings.outputFormat).toBe('docx');
  });
});
