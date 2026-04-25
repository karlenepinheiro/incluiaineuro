import React from 'react';
import { Brain, Edit3, BookOpen, UserCheck, Focus, Lightbulb } from 'lucide-react';
import { SmartTextarea, SmartContext } from './SmartTextarea';
import { PriorKnowledgeProfile, PriorKnowledgeScore } from '../types';

export type PedagogicalProfileAreaKey =
  | 'leitura'
  | 'escrita'
  | 'entendimento'
  | 'autonomia'
  | 'atencao'
  | 'raciocinio';

export type PedagogicalProfileSuggestionKey =
  | PedagogicalProfileAreaKey
  | 'observacoes_pedagogicas';

interface Props {
  data?: PriorKnowledgeProfile;
  onChange: (data: PriorKnowledgeProfile) => void;
  onSuggestAI?: (areaKey: PedagogicalProfileSuggestionKey) => Promise<void>;
  generatingAreas?: Partial<Record<PedagogicalProfileSuggestionKey, boolean>>;
}

type PedagogicalProfileAreaConfig = {
  key: PedagogicalProfileAreaKey;
  scoreKey: keyof Pick<
    PriorKnowledgeProfile,
    | 'leitura_score'
    | 'escrita_score'
    | 'entendimento_score'
    | 'autonomia_score'
    | 'atencao_score'
    | 'raciocinio_score'
  >;
  notesKey: keyof Pick<
    PriorKnowledgeProfile,
    | 'leitura_notes'
    | 'escrita_notes'
    | 'entendimento_notes'
    | 'autonomia_notes'
    | 'atencao_notes'
    | 'raciocinio_notes'
  >;
  label: string;
  icon: React.ElementType;
  context: SmartContext;
};

const SCORE_OPTIONS: readonly PriorKnowledgeScore[] = [1, 2, 3, 4, 5];

const AREAS: readonly PedagogicalProfileAreaConfig[] = [
  { key: 'leitura', scoreKey: 'leitura_score', notesKey: 'leitura_notes', label: 'Leitura', icon: BookOpen, context: 'leitura' },
  { key: 'escrita', scoreKey: 'escrita_score', notesKey: 'escrita_notes', label: 'Escrita', icon: Edit3, context: 'escrita' },
  { key: 'entendimento', scoreKey: 'entendimento_score', notesKey: 'entendimento_notes', label: 'Compreensão / Entendimento', icon: Brain, context: 'compreensao' },
  { key: 'autonomia', scoreKey: 'autonomia_score', notesKey: 'autonomia_notes', label: 'Autonomia', icon: UserCheck, context: 'autonomia' },
  { key: 'atencao', scoreKey: 'atencao_score', notesKey: 'atencao_notes', label: 'Atenção', icon: Focus, context: 'atencao' },
  { key: 'raciocinio', scoreKey: 'raciocinio_score', notesKey: 'raciocinio_notes', label: 'Raciocínio Lógico-Matemático', icon: Lightbulb, context: 'raciocinio' },
];

export const PedagogicalProfileSection: React.FC<Props> = ({
  data = {},
  onChange,
  onSuggestAI,
  generatingAreas = {},
}) => {
  const updateField = <K extends keyof PriorKnowledgeProfile>(
    field: K,
    value: PriorKnowledgeProfile[K],
  ) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <section className="space-y-6">
      <div className="mb-4">
        <h3 className="text-lg font-bold text-[#1F4E5F] flex items-center gap-2">
          <BookOpen size={20} className="text-brand-600" />
          Conhecimento Prévio e Perfil Pedagógico
        </h3>
        <p className="text-sm text-gray-500">
          Avalie o nível de 1 (muito baixo) a 5 (muito alto) e registre observações. Use a voz e as sugestões automáticas baseadas no score para ganhar tempo.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {AREAS.map(({ key, scoreKey, notesKey, label, icon: Icon, context }) => {
          const currentScore = data[scoreKey];
          const currentNotes = data[notesKey] || '';

          return (
            <div key={key} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[#1F4E5F] font-semibold">
                  <Icon size={18} />
                  {label}
                </div>

                <div className="flex gap-1 bg-gray-50 p-1 rounded-lg border border-gray-100">
                  {SCORE_OPTIONS.map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => updateField(scoreKey, currentScore === num ? undefined : num)}
                      className={`w-7 h-7 rounded-md text-xs font-bold transition-all ${
                        currentScore === num
                          ? 'bg-[#0f766e] text-white shadow-md'
                          : 'text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>

              <SmartTextarea
                value={currentNotes}
                onChange={(val) => updateField(notesKey, val)}
                context={context}
                score={currentScore}
                placeholder={`Observações sobre ${label.toLowerCase()}...`}
                onSuggestAI={onSuggestAI ? () => onSuggestAI(key) : undefined}
                isGeneratingAI={generatingAreas[key]}
                rows={3}
              />
            </div>
          );
        })}
      </div>

      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mt-6 flex flex-col gap-3">
        <label className="text-sm font-semibold text-[#1F4E5F]">
          Observações Pedagógicas Iniciais do Professor
        </label>
        <SmartTextarea
          value={data.observacoes_pedagogicas || ''}
          onChange={(val) => updateField('observacoes_pedagogicas', val)}
          context="general"
          placeholder="Observações gerais do professor sobre o perfil pedagógico inicial do aluno..."
          onSuggestAI={onSuggestAI ? () => onSuggestAI('observacoes_pedagogicas') : undefined}
          isGeneratingAI={generatingAreas.observacoes_pedagogicas}
          rows={4}
        />
      </div>
    </section>
  );
};
