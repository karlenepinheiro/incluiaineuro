/**
 * CareRoutineTab.tsx
 * Aba "Cuidadoras e Rotina" no dossiê do aluno.
 * Seções e campos dinâmicos, persistidos em student_custom_sections + student_custom_fields.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Plus, Trash2, Save, ChevronDown, ChevronRight, Mic, MicOff,
  AlertCircle, Info, GripVertical, Settings, Check, X,
  Heart, Moon, Utensils, Eye, MessageSquare, Smile, Star,
  Users, Lightbulb, Activity, Bus, Pill, Home, BookOpen,
} from 'lucide-react';
import { Student, User as UserType } from '../types';
import { CareRoutineService, CareSection, CareField, FieldType } from '../services/careRoutineService';

// ─── Modelos de seção ─────────────────────────────────────────────────────────

interface SectionTemplate {
  title: string;
  icon: React.ReactNode;
  description: string;
  defaultFields: { label: string; field_type: FieldType; options?: any }[];
}

const SECTION_TEMPLATES: SectionTemplate[] = [
  {
    title: 'Rotina alimentar',
    icon: <Utensils size={15} />,
    description: 'Horários, alimentos aceitos/rejeitados, dificuldades',
    defaultFields: [
      { label: 'Horários das refeições', field_type: 'text' },
      { label: 'Alimentos aceitos', field_type: 'text' },
      { label: 'Alimentos rejeitados / sensibilidades', field_type: 'text' },
      { label: 'Dificuldades alimentares', field_type: 'checklist', options: { items: ['Deglutição', 'Textura', 'Temperatura', 'Seletividade extrema', 'Recusa de novos alimentos'] } },
    ],
  },
  {
    title: 'Observações da cuidadora',
    icon: <Heart size={15} />,
    description: 'Quem cuida, como cuida, observações gerais',
    defaultFields: [
      { label: 'Nome da cuidadora / responsável', field_type: 'text' },
      { label: 'Tipo de cuidado', field_type: 'suggestions', options: { chips: ['Familiar direto', 'Cuidadora contratada', 'Acompanhante terapêutico', 'Revezamento familiar'] } },
      { label: 'Horário de presença na escola', field_type: 'text' },
      { label: 'Observações gerais da cuidadora', field_type: 'audio' },
    ],
  },
  {
    title: 'Rotina de sono e descanso',
    icon: <Moon size={15} />,
    description: 'Horários, qualidade, interrupções',
    defaultFields: [
      { label: 'Horário de dormir', field_type: 'text' },
      { label: 'Horário de acordar', field_type: 'text' },
      { label: 'Qualidade do sono (1 = muito ruim, 5 = muito boa)', field_type: 'scale', options: { min: 1, max: 5 } },
      { label: 'Interrupções frequentes', field_type: 'checklist', options: { items: ['Acorda várias vezes', 'Pesadelos', 'Dificuldade de iniciar o sono', 'Choro noturno', 'Bate a cabeça'] } },
      { label: 'Observações sobre o descanso', field_type: 'text' },
    ],
  },
  {
    title: 'Preferências sensoriais',
    icon: <Eye size={15} />,
    description: 'Estímulos que agradaem ou incomodam',
    defaultFields: [
      { label: 'Estímulos que agrada / busca', field_type: 'text' },
      { label: 'Estímulos que incomoda / evita', field_type: 'text' },
      { label: 'Sensibilidades identificadas', field_type: 'checklist', options: { items: ['Som alto', 'Luz intensa', 'Toque inesperado', 'Texturas específicas', 'Cheiros fortes', 'Ambientes cheios', 'Mudanças de ambiente'] } },
      { label: 'Estratégias sensoriais que funcionam', field_type: 'text' },
    ],
  },
  {
    title: 'Comunicação funcional',
    icon: <MessageSquare size={15} />,
    description: 'Como o aluno se comunica no dia a dia',
    defaultFields: [
      { label: 'Formas de comunicação usadas', field_type: 'checklist', options: { items: ['Verbal oral', 'Gestos', 'PECS', 'Prancha de comunicação', 'Dispositivo com voz', 'Apontar', 'Expressão facial'] } },
      { label: 'Como expressa necessidades básicas', field_type: 'text' },
      { label: 'Como expressa desconforto ou dor', field_type: 'text' },
      { label: 'Palavras / sinais funcionais que usa com frequência', field_type: 'text' },
    ],
  },
  {
    title: 'Regulação emocional',
    icon: <Smile size={15} />,
    description: 'Gatilhos, estratégias de autorregulação',
    defaultFields: [
      { label: 'Gatilhos de desregulação', field_type: 'text' },
      { label: 'Sinais de desconforto ou sobrecarga', field_type: 'text' },
      { label: 'Estratégias que ajudam a regular', field_type: 'text' },
      { label: 'Nível médio de regulação na escola (1 = muito difícil, 5 = muito bem)', field_type: 'scale', options: { min: 1, max: 5 } },
    ],
  },
  {
    title: 'Autonomia diária',
    icon: <Star size={15} />,
    description: 'Atividades de vida diária que realiza com ou sem apoio',
    defaultFields: [
      { label: 'Realiza com independência', field_type: 'checklist', options: { items: ['Higiene pessoal', 'Alimentação', 'Vestuário', 'Deslocamento interno', 'Uso do banheiro', 'Organização do material'] } },
      { label: 'Realiza com apoio parcial', field_type: 'text' },
      { label: 'Precisa de apoio total', field_type: 'text' },
      { label: 'Metas de autonomia a trabalhar', field_type: 'text' },
    ],
  },
  {
    title: 'Interação social',
    icon: <Users size={15} />,
    description: 'Como interage com colegas e adultos',
    defaultFields: [
      { label: 'Interação com colegas', field_type: 'suggestions', options: { chips: ['Busca ativamente', 'Aceita quando convidado', 'Prefere ficar sozinho', 'Dificuldade com limites', 'Conflitos frequentes'] } },
      { label: 'Interação com adultos', field_type: 'suggestions', options: { chips: ['Muito vinculado', 'Adequada', 'Resistência inicial', 'Evita contato'] } },
      { label: 'Situações sociais que funcionam bem', field_type: 'text' },
      { label: 'Situações sociais que geram dificuldade', field_type: 'text' },
    ],
  },
  {
    title: 'Preferências e interesses',
    icon: <Lightbulb size={15} />,
    description: 'O que motiva e engaja o aluno',
    defaultFields: [
      { label: 'Interesses e temas favoritos', field_type: 'text' },
      { label: 'Atividades preferidas na escola', field_type: 'text' },
      { label: 'Reforçadores positivos eficazes', field_type: 'text' },
      { label: 'O que definitivamente não funciona como motivação', field_type: 'text' },
    ],
  },
  {
    title: 'Estratégias que funcionam',
    icon: <Check size={15} />,
    description: 'Abordagens pedagógicas e de manejo validadas',
    defaultFields: [
      { label: 'Estratégias pedagógicas eficazes', field_type: 'text' },
      { label: 'Estratégias de manejo comportamental', field_type: 'text' },
      { label: 'O que deve ser evitado', field_type: 'text' },
    ],
  },
  {
    title: 'Observações da família',
    icon: <Home size={15} />,
    description: 'Contexto familiar e percepção dos responsáveis',
    defaultFields: [
      { label: 'Contexto familiar relevante', field_type: 'text' },
      { label: 'Percepção da família sobre o aluno na escola', field_type: 'audio' },
      { label: 'Demandas e expectativas da família', field_type: 'text' },
      { label: 'Acordos e combinados com a família', field_type: 'text' },
    ],
  },
  {
    title: 'Transporte e chegada à escola',
    icon: <Bus size={15} />,
    description: 'Como chega, com quem, estado ao chegar',
    defaultFields: [
      { label: 'Meio de transporte', field_type: 'suggestions', options: { chips: ['Transporte escolar público', 'Veículo da família', 'A pé', 'Transporte adaptado', 'Com cuidador específico'] } },
      { label: 'Acompanhante na chegada', field_type: 'text' },
      { label: 'Estado habitual ao chegar', field_type: 'suggestions', options: { chips: ['Tranquilo e receptivo', 'Agitado', 'Sonolento', 'Ansioso', 'Variável'] } },
      { label: 'Observações sobre a chegada', field_type: 'text' },
    ],
  },
  {
    title: 'Saúde e medicação complementar',
    icon: <Pill size={15} />,
    description: 'Informações de saúde relevantes para a escola',
    defaultFields: [
      { label: 'Condições de saúde relevantes para a escola', field_type: 'text' },
      { label: 'Medicação em uso (nome e horário)', field_type: 'text' },
      { label: 'Efeitos observáveis da medicação na escola', field_type: 'text' },
      { label: 'Alertas e procedimentos de emergência', field_type: 'text' },
    ],
  },
  {
    title: 'Plano de acolhimento',
    icon: <Activity size={15} />,
    description: 'Como receber o aluno nos momentos difíceis',
    defaultFields: [
      { label: 'Rotina de acolhimento na chegada', field_type: 'text' },
      { label: 'O que fazer em momentos de desregulação', field_type: 'text' },
      { label: 'Espaço de autorregulação disponível', field_type: 'text' },
      { label: 'Adulto de referência na escola', field_type: 'text' },
    ],
  },
  {
    title: 'Observações livres da escola',
    icon: <BookOpen size={15} />,
    description: 'Anotações gerais da equipe escolar',
    defaultFields: [
      { label: 'Observações gerais', field_type: 'audio' },
      { label: 'Eventos importantes recentes', field_type: 'text' },
      { label: 'Próximos passos a acompanhar', field_type: 'text' },
    ],
  },
];

// ─── Tipos de campo disponíveis ───────────────────────────────────────────────

const FIELD_TYPE_OPTIONS: { value: FieldType; label: string }[] = [
  { value: 'text',        label: 'Texto Livre' },
  { value: 'suggestions', label: 'Sugestões + Texto' },
  { value: 'checklist',   label: 'Checklist' },
  { value: 'scale',       label: 'Escala Avaliativa' },
  { value: 'rubric',      label: 'Rubrica' },
  { value: 'ai_prompt',   label: 'Prompt IA' },
  { value: 'audio',       label: 'Transcrição por Áudio' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isFieldEmpty(field: CareField): boolean {
  const v = field.value;
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (typeof v === 'object') {
    if (Array.isArray(v)) return v.length === 0;
    if ('text' in v) return !v.text?.trim() && !(v.selected?.length);
    if ('checked' in v) return !v.checked?.length;
    if ('score' in v) return v.score === null || v.score === undefined;
  }
  return false;
}

function makeDefaultField(overrides: Partial<CareField> & { label: string; field_type: FieldType }): CareField {
  return {
    label:        overrides.label,
    field_type:   overrides.field_type,
    value:        null,
    options:      overrides.options ?? null,
    is_required:  false,
    enable_audio: overrides.field_type === 'audio',
    order_index:  0,
  };
}

// ─── Renderizadores de campo ──────────────────────────────────────────────────

const colors = {
  petrol: '#1F4E5F',
  dark:   '#2E3A59',
  gold:   '#C69214',
  bg:     '#F6F4EF',
  border: '#E7E2D8',
};

interface FieldRendererProps {
  field: CareField;
  isRequired: boolean;
  showError: boolean;
  onChange: (value: any) => void;
}

function FieldRenderer({ field, isRequired, showError, onChange }: FieldRendererProps) {
  const baseTextarea = (value: string, onChangeText: (v: string) => void, placeholder?: string) => (
    <textarea
      value={value}
      onChange={e => onChangeText(e.target.value)}
      rows={3}
      placeholder={placeholder ?? 'Digite aqui…'}
      className="w-full text-sm rounded-lg px-3 py-2 resize-none focus:outline-none transition"
      style={{
        border: `1.5px solid ${showError ? '#DC2626' : colors.border}`,
        background: showError ? '#FEF2F2' : '#FAFAF8',
        color: '#1a1a1a',
      }}
    />
  );

  switch (field.field_type) {
    case 'text':
      return baseTextarea(field.value ?? '', onChange);

    case 'audio': {
      const [recording, setRecording] = useState(false);
      const recognitionRef = useRef<any>(null);

      const startRecording = () => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) { alert('Seu navegador não suporta reconhecimento de voz.'); return; }
        const r = new SpeechRecognition();
        r.lang = 'pt-BR';
        r.continuous = true;
        r.interimResults = false;
        r.onresult = (ev: any) => {
          const transcript = Array.from(ev.results)
            .map((res: any) => res[0].transcript)
            .join(' ');
          onChange((field.value ?? '') + (field.value ? ' ' : '') + transcript);
        };
        r.onerror = () => setRecording(false);
        r.onend = () => setRecording(false);
        r.start();
        recognitionRef.current = r;
        setRecording(true);
      };

      const stopRecording = () => {
        recognitionRef.current?.stop();
        setRecording(false);
      };

      return (
        <div className="space-y-1.5">
          <div className="relative">
            {baseTextarea(field.value ?? '', onChange, 'Digite ou use o microfone para transcrever…')}
            <button
              type="button"
              onClick={recording ? stopRecording : startRecording}
              title={recording ? 'Parar gravação' : 'Iniciar transcrição por áudio'}
              className="absolute bottom-2 right-2 p-1.5 rounded-lg transition"
              style={{ background: recording ? '#FEE2E2' : '#EFF6FF', color: recording ? '#DC2626' : '#3B82F6' }}
            >
              {recording ? <MicOff size={14} /> : <Mic size={14} />}
            </button>
          </div>
          {recording && (
            <p className="text-[11px] text-red-500 flex items-center gap-1 animate-pulse">
              <span className="w-2 h-2 bg-red-500 rounded-full inline-block" />
              Gravando… clique no microfone para parar.
            </p>
          )}
        </div>
      );
    }

    case 'checklist': {
      const items: string[] = field.options?.items ?? [];
      const checked: number[] = field.value?.checked ?? [];
      const [newItem, setNewItem] = useState('');

      const toggleItem = (idx: number) => {
        const next = checked.includes(idx)
          ? checked.filter(i => i !== idx)
          : [...checked, idx];
        onChange({ checked: next });
      };

      const addItem = () => {
        const trimmed = newItem.trim();
        if (!trimmed) return;
        const newItems = [...items, trimmed];
        field.options = { ...(field.options ?? {}), items: newItems };
        setNewItem('');
        onChange({ checked });
      };

      return (
        <div className="space-y-1.5">
          {items.map((item, idx) => (
            <label key={idx} className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={checked.includes(idx)}
                onChange={() => toggleItem(idx)}
                className="w-4 h-4 rounded accent-brand-600"
              />
              <span className="text-sm text-gray-700 group-hover:text-gray-900">{item}</span>
            </label>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="text"
              value={newItem}
              onChange={e => setNewItem(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
              placeholder="Adicionar item…"
              className="flex-1 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none"
              style={{ border: `1px solid ${colors.border}`, background: colors.bg }}
            />
            <button
              type="button"
              onClick={addItem}
              className="text-xs px-2 py-1.5 rounded-lg font-semibold transition"
              style={{ background: colors.petrol, color: '#fff' }}
            >
              +
            </button>
          </div>
        </div>
      );
    }

    case 'scale': {
      const min = field.options?.min ?? 1;
      const max = field.options?.max ?? 5;
      const score: number | null = field.value?.score ?? null;
      const steps = Array.from({ length: max - min + 1 }, (_, i) => min + i);
      const scaleLabels: Record<number, string> = { 1: 'Muito difícil', 2: 'Difícil', 3: 'Moderado', 4: 'Bom', 5: 'Excelente' };

      return (
        <div className="space-y-2">
          <div className="flex gap-2 flex-wrap">
            {steps.map(n => (
              <button
                key={n}
                type="button"
                onClick={() => onChange({ score: n })}
                className="w-10 h-10 rounded-xl text-sm font-bold border-2 transition"
                style={{
                  borderColor: score === n ? colors.petrol : colors.border,
                  background:  score === n ? colors.petrol : '#fff',
                  color:       score === n ? '#fff' : '#374151',
                }}
              >
                {n}
              </button>
            ))}
          </div>
          {score !== null && (
            <p className="text-xs text-gray-500">{scaleLabels[score] ?? `Nível ${score}`}</p>
          )}
        </div>
      );
    }

    case 'suggestions': {
      const chips: string[] = field.options?.chips ?? [];
      const selected: number[] = field.value?.selected ?? [];
      const text: string = field.value?.text ?? '';

      const toggleChip = (idx: number) => {
        const next = selected.includes(idx)
          ? selected.filter(i => i !== idx)
          : [...selected, idx];
        onChange({ selected: next, text });
      };

      return (
        <div className="space-y-2">
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {chips.map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => toggleChip(idx)}
                  className="text-xs px-3 py-1 rounded-full border font-medium transition"
                  style={{
                    borderColor: selected.includes(idx) ? colors.petrol : colors.border,
                    background:  selected.includes(idx) ? '#EFF6FF' : '#fff',
                    color:       selected.includes(idx) ? colors.petrol : '#6B7280',
                  }}
                >
                  {chip}
                </button>
              ))}
            </div>
          )}
          {baseTextarea(text, t => onChange({ selected, text: t }), 'Observações complementares…')}
        </div>
      );
    }

    case 'rubric': {
      const criteria: string[] = field.options?.criteria ?? ['Critério 1', 'Critério 2'];
      const levels:   string[] = field.options?.levels   ?? ['Iniciando', 'Em progresso', 'Atingido'];
      const vals: Record<string, string> = field.value ?? {};

      return (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                <th className="p-2 text-left font-semibold text-gray-500 border border-gray-100 bg-gray-50">Critério</th>
                {levels.map(l => (
                  <th key={l} className="p-2 text-center font-semibold text-gray-500 border border-gray-100 bg-gray-50">{l}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {criteria.map(cr => (
                <tr key={cr}>
                  <td className="p-2 font-medium text-gray-700 border border-gray-100">{cr}</td>
                  {levels.map(lv => (
                    <td key={lv} className="p-2 text-center border border-gray-100">
                      <button
                        type="button"
                        onClick={() => onChange({ ...vals, [cr]: vals[cr] === lv ? undefined : lv })}
                        className="w-5 h-5 rounded-full border-2 flex items-center justify-center mx-auto transition"
                        style={{
                          borderColor: vals[cr] === lv ? colors.petrol : colors.border,
                          background:  vals[cr] === lv ? colors.petrol : '#fff',
                        }}
                      >
                        {vals[cr] === lv && <Check size={10} color="#fff" />}
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    case 'ai_prompt': {
      const [generating, setGenerating] = useState(false);
      return (
        <div className="space-y-2">
          {baseTextarea(field.value ?? '', onChange, 'Conteúdo gerado pela IA aparecerá aqui…')}
          <button
            type="button"
            disabled={generating}
            onClick={async () => {
              setGenerating(true);
              await new Promise(r => setTimeout(r, 800));
              onChange((field.value ? field.value + '\n\n' : '') + `[Sugestão IA para "${field.label}": preencha com base no perfil do aluno.]`);
              setGenerating(false);
            }}
            className="text-xs px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition"
            style={{ background: colors.dark, color: '#fff', opacity: generating ? 0.6 : 1 }}
          >
            {generating ? '⏳ Gerando…' : '✨ Gerar com IA'}
          </button>
        </div>
      );
    }

    default:
      return baseTextarea(field.value ?? '', onChange);
  }
}

// ─── Modal: Adicionar Seção ───────────────────────────────────────────────────

interface AddSectionModalProps {
  usedTitles: Set<string>;
  onSelect: (template: SectionTemplate | null, customTitle?: string) => void;
  onClose: () => void;
}

function AddSectionModal({ usedTitles, onSelect, onClose }: AddSectionModalProps) {
  const [customTitle, setCustomTitle] = useState('');
  const [tab, setTab] = useState<'templates' | 'custom'>('templates');

  return (
    <div className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center p-4">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
        style={{ border: `1.5px solid ${colors.border}` }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: colors.border }}>
          <h3 className="text-base font-bold text-gray-900">Adicionar seção</h3>
          <button onClick={onClose}><X size={18} className="text-gray-400 hover:text-gray-700" /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b" style={{ borderColor: colors.border }}>
          {(['templates', 'custom'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 py-2.5 text-xs font-bold transition border-b-2"
              style={{
                borderColor: tab === t ? colors.petrol : 'transparent',
                color: tab === t ? colors.petrol : '#6B7280',
              }}
            >
              {t === 'templates' ? 'Modelos prontos' : 'Seção personalizada'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[60vh] p-4">
          {tab === 'templates' ? (
            <div className="space-y-2">
              {SECTION_TEMPLATES.map(tpl => {
                const already = usedTitles.has(tpl.title);
                return (
                  <button
                    key={tpl.title}
                    onClick={() => !already && onSelect(tpl)}
                    disabled={already}
                    className="w-full text-left flex items-center gap-3 p-3 rounded-xl border transition"
                    style={{
                      borderColor: already ? '#E5E7EB' : colors.border,
                      background:  already ? '#F9FAFB' : '#FAFAF8',
                      opacity:     already ? 0.5 : 1,
                      cursor:      already ? 'default' : 'pointer',
                    }}
                  >
                    <span className="text-gray-500 shrink-0">{tpl.icon}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                        {tpl.title}
                        {already && <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">Adicionada</span>}
                      </p>
                      <p className="text-[11px] text-gray-400 truncate">{tpl.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">Crie uma seção com título personalizado e adicione os campos que quiser.</p>
              <input
                type="text"
                value={customTitle}
                onChange={e => setCustomTitle(e.target.value)}
                placeholder="Nome da seção…"
                autoFocus
                maxLength={80}
                onKeyDown={e => { if (e.key === 'Enter' && customTitle.trim()) onSelect(null, customTitle.trim()); }}
                className="w-full text-sm rounded-xl px-3 py-2.5 focus:outline-none"
                style={{ border: `1.5px solid ${colors.border}`, background: colors.bg }}
              />
              <button
                onClick={() => { if (customTitle.trim()) onSelect(null, customTitle.trim()); }}
                disabled={!customTitle.trim()}
                className="w-full py-2.5 rounded-xl text-sm font-bold text-white transition"
                style={{ background: customTitle.trim() ? colors.petrol : '#9CA3AF' }}
              >
                Criar seção
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Adicionar Campo ───────────────────────────────────────────────────

interface AddFieldModalProps {
  onAdd: (field: CareField) => void;
  onClose: () => void;
}

function AddFieldModal({ onAdd, onClose }: AddFieldModalProps) {
  const [label, setLabel] = useState('');
  const [fieldType, setFieldType] = useState<FieldType>('text');
  const [isRequired, setIsRequired] = useState(false);

  const handleAdd = () => {
    if (!label.trim()) return;
    onAdd(makeDefaultField({ label: label.trim(), field_type: fieldType, is_required: isRequired } as any));
  };

  return (
    <div className="fixed inset-0 z-[130] bg-black/50 flex items-center justify-center p-4">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        style={{ border: `1.5px solid ${colors.border}` }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: colors.border }}>
          <h3 className="text-base font-bold text-gray-900">Adicionar campo</h3>
          <button onClick={onClose}><X size={18} className="text-gray-400 hover:text-gray-700" /></button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Nome do campo</label>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              autoFocus
              placeholder="Ex: Como chega à escola…"
              onKeyDown={e => { if (e.key === 'Enter' && label.trim()) handleAdd(); }}
              className="w-full text-sm rounded-xl px-3 py-2.5 focus:outline-none"
              style={{ border: `1.5px solid ${colors.border}`, background: colors.bg }}
            />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Tipo de campo</label>
            <div className="grid grid-cols-2 gap-2">
              {FIELD_TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFieldType(opt.value)}
                  className="text-xs py-2 px-3 rounded-lg border font-medium text-left transition"
                  style={{
                    borderColor: fieldType === opt.value ? colors.petrol : colors.border,
                    background:  fieldType === opt.value ? '#EFF6FF' : '#FAFAF8',
                    color:       fieldType === opt.value ? colors.petrol : '#374151',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={isRequired}
              onChange={e => setIsRequired(e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm text-gray-700">Campo obrigatório</span>
          </label>

          <button
            onClick={handleAdd}
            disabled={!label.trim()}
            className="w-full py-2.5 rounded-xl text-sm font-bold text-white transition"
            style={{ background: label.trim() ? colors.petrol : '#9CA3AF' }}
          >
            Adicionar campo
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Alerta de campo obrigatório ──────────────────────────────────────

interface RequiredAlertProps {
  fieldLabels: string[];
  onBack: () => void;
  onSaveAnyway: () => void;
}

function RequiredAlert({ fieldLabels, onBack, onSaveAnyway }: RequiredAlertProps) {
  return (
    <div className="fixed inset-0 z-[140] bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-5 py-5">
          <div className="flex items-start gap-3 mb-4">
            <AlertCircle size={22} className="text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-base font-bold text-gray-900 mb-1">
                Professora, você não preencheu {fieldLabels.length === 1 ? 'este campo' : 'estes campos'}.
              </p>
              <ul className="list-disc list-inside space-y-0.5">
                {fieldLabels.map(l => (
                  <li key={l} className="text-sm text-red-600 font-medium">{l}</li>
                ))}
              </ul>
              <p className="text-sm text-gray-500 mt-2">Pode salvar assim mesmo?</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onBack}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold border transition"
              style={{ borderColor: colors.border, color: colors.petrol }}
            >
              Voltar e preencher
            </button>
            <button
              onClick={onSaveAnyway}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition"
              style={{ background: '#DC2626' }}
            >
              Salvar mesmo assim
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface CareRoutineTabProps {
  student: Student;
  user?: UserType;
}

export const CareRoutineTab: React.FC<CareRoutineTabProps> = ({ student, user }) => {
  const [sections, setSections]                   = useState<CareSection[]>([]);
  const [deletedSectionIds, setDeletedSectionIds] = useState<string[]>([]);
  const [deletedFieldIds, setDeletedFieldIds]     = useState<string[]>([]);
  const [loading, setLoading]                     = useState(true);
  const [saving, setSaving]                       = useState(false);
  const [saved, setSaved]                         = useState(false);
  const [expanded, setExpanded]                   = useState<Set<number>>(new Set());
  const [showAddSection, setShowAddSection]       = useState(false);
  const [addFieldForIndex, setAddFieldForIndex]   = useState<number | null>(null);
  const [errorFields, setErrorFields]             = useState<Set<string>>(new Set()); // "secIdx-fldIdx"
  const [requiredAlert, setRequiredAlert]         = useState<{ labels: string[] } | null>(null);
  const [pendingSaveForce, setPendingSaveForce]   = useState(false);
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;

  // ── Carregar do banco ──
  useEffect(() => {
    if (!student.id) { setLoading(false); return; }
    CareRoutineService.load(student.id)
      .then(data => {
        setSections(data);
        setExpanded(new Set(data.map((_, i) => i)));
      })
      .catch(e => console.error('[CareRoutineTab] load:', e))
      .finally(() => setLoading(false));
  }, [student.id]);

  // ── Salvar ──
  const handleSave = useCallback(async (force = false) => {
    const current = sectionsRef.current;

    if (!force) {
      const emptyRequired: { key: string; label: string }[] = [];
      current.forEach((sec, si) => {
        sec.fields.forEach((fld, fi) => {
          if (fld.is_required && isFieldEmpty(fld)) {
            emptyRequired.push({ key: `${si}-${fi}`, label: fld.label });
          }
        });
      });
      if (emptyRequired.length > 0) {
        setErrorFields(new Set(emptyRequired.map(e => e.key)));
        setRequiredAlert({ labels: emptyRequired.map(e => e.label) });
        return;
      }
    }

    setErrorFields(new Set());
    setRequiredAlert(null);
    setSaving(true);

    try {
      const tenantId = user?.tenant_id ?? '';
      const userId   = user?.id        ?? '';

      if (!tenantId || !userId) {
        alert('Sessão inválida. Por favor, recarregue a página.');
        return;
      }

      const mutable = current.map(s => ({ ...s, fields: s.fields.map(f => ({ ...f })) }));
      await CareRoutineService.saveAll({
        studentId:         student.id,
        tenantId,
        userId,
        sections:          mutable,
        deletedSectionIds,
        deletedFieldIds,
      });

      setSections(mutable);
      setDeletedSectionIds([]);
      setDeletedFieldIds([]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      alert('Erro ao salvar: ' + (e?.message ?? 'Verifique sua conexão.'));
    } finally {
      setSaving(false);
    }
  }, [student.id, user, deletedSectionIds, deletedFieldIds]);

  // ── Adicionar seção ──
  const handleAddSection = (template: SectionTemplate | null, customTitle?: string) => {
    const title = template?.title ?? customTitle ?? 'Nova seção';
    const newSection: CareSection = {
      title,
      category:    'care_routine',
      order_index: sections.length,
      fields: (template?.defaultFields ?? []).map((f, i) => ({
        ...makeDefaultField(f),
        order_index: i,
      })),
    };
    const next = [...sections, newSection];
    setSections(next);
    setExpanded(prev => new Set([...prev, next.length - 1]));
    setShowAddSection(false);
  };

  // ── Remover seção ──
  const handleRemoveSection = (idx: number) => {
    if (!window.confirm(`Remover a seção "${sections[idx].title}"? Esta ação não pode ser desfeita.`)) return;
    const sec = sections[idx];
    if (sec.id) setDeletedSectionIds(prev => [...prev, sec.id!]);
    sec.fields.forEach(f => { if (f.id) setDeletedFieldIds(prev => [...prev, f.id!]); });
    setSections(prev => prev.filter((_, i) => i !== idx));
    setExpanded(prev => {
      const next = new Set<number>();
      prev.forEach(i => { if (i < idx) next.add(i); else if (i > idx) next.add(i - 1); });
      return next;
    });
  };

  // ── Adicionar campo ──
  const handleAddField = (secIdx: number, field: CareField) => {
    setSections(prev => prev.map((s, i) => i !== secIdx ? s : {
      ...s,
      fields: [...s.fields, { ...field, order_index: s.fields.length }],
    }));
    setAddFieldForIndex(null);
  };

  // ── Remover campo ──
  const handleRemoveField = (secIdx: number, fldIdx: number) => {
    const fld = sections[secIdx].fields[fldIdx];
    if (fld.id) setDeletedFieldIds(prev => [...prev, fld.id!]);
    setSections(prev => prev.map((s, i) => i !== secIdx ? s : {
      ...s,
      fields: s.fields.filter((_, j) => j !== fldIdx),
    }));
  };

  // ── Atualizar valor de campo ──
  const handleFieldChange = (secIdx: number, fldIdx: number, value: any) => {
    setSections(prev => prev.map((s, i) => i !== secIdx ? s : {
      ...s,
      fields: s.fields.map((f, j) => j !== fldIdx ? f : { ...f, value }),
    }));
    const key = `${secIdx}-${fldIdx}`;
    if (errorFields.has(key)) {
      setErrorFields(prev => { const next = new Set(prev); next.delete(key); return next; });
    }
  };

  // ── Toggle required ──
  const handleToggleRequired = (secIdx: number, fldIdx: number) => {
    setSections(prev => prev.map((s, i) => i !== secIdx ? s : {
      ...s,
      fields: s.fields.map((f, j) => j !== fldIdx ? f : { ...f, is_required: !f.is_required }),
    }));
  };

  // ── Editar título da seção ──
  const handleSectionTitleChange = (idx: number, title: string) => {
    setSections(prev => prev.map((s, i) => i !== idx ? s : { ...s, title }));
  };

  // ── Toggle expand ──
  const toggleExpand = (idx: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const usedTitles = new Set(sections.map(s => s.title));

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* ── Banner informativo ── */}
      <div
        className="rounded-2xl px-5 py-4 flex items-start gap-3"
        style={{ background: '#EFF6FF', border: '1px solid #BFDBFE' }}
      >
        <Info size={16} className="text-blue-500 shrink-0 mt-0.5" />
        <p className="text-sm text-blue-800 leading-relaxed">
          <strong>Cuidadoras e Rotina</strong> — Essas informações não substituem o cadastro oficial, laudos ou documentos escolares.
          Elas ajudam a equipe e a IA do IncluiAI a compreender melhor a rotina, os cuidados, os gatilhos, os interesses e as estratégias que funcionam com o aluno.
        </p>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm gap-2">
          <span className="animate-spin">⏳</span> Carregando…
        </div>
      )}

      {/* ── Seções ── */}
      {!loading && sections.map((sec, si) => (
        <div
          key={si}
          className="bg-white rounded-2xl shadow-sm overflow-hidden"
          style={{ border: `1.5px solid ${colors.border}` }}
        >
          {/* Header da seção */}
          <div
            className="flex items-center gap-3 px-5 py-3.5 cursor-pointer hover:bg-gray-50 transition"
            onClick={() => toggleExpand(si)}
          >
            <GripVertical size={14} className="text-gray-300 shrink-0" />
            {expanded.has(si) ? <ChevronDown size={15} className="text-gray-400 shrink-0" /> : <ChevronRight size={15} className="text-gray-400 shrink-0" />}
            <input
              value={sec.title}
              onChange={e => { e.stopPropagation(); handleSectionTitleChange(si, e.target.value); }}
              onClick={e => e.stopPropagation()}
              className="flex-1 text-sm font-bold text-gray-800 bg-transparent focus:outline-none focus:underline"
              style={{ minWidth: 0 }}
            />
            <span className="text-[10px] text-gray-400 font-medium shrink-0">
              {sec.fields.length} campo{sec.fields.length !== 1 ? 's' : ''}
            </span>
            <button
              onClick={e => { e.stopPropagation(); handleRemoveSection(si); }}
              className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition shrink-0"
              title="Remover seção"
            >
              <Trash2 size={13} />
            </button>
          </div>

          {/* Campos */}
          {expanded.has(si) && (
            <div className="px-5 pb-4 space-y-4 border-t" style={{ borderColor: colors.border }}>
              {sec.fields.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">Nenhum campo ainda. Adicione campos abaixo.</p>
              )}

              {sec.fields.map((fld, fi) => {
                const errKey = `${si}-${fi}`;
                const hasErr = errorFields.has(errKey);
                return (
                  <div key={fi} className="space-y-1.5 pt-3">
                    {/* Label + controles */}
                    <div className="flex items-center gap-2">
                      <label className="flex-1 text-xs font-bold text-gray-700 flex items-center gap-1.5">
                        {fld.label}
                        {fld.is_required && (
                          <span className="text-red-500" title="Campo obrigatório">*</span>
                        )}
                        {hasErr && (
                          <span className="text-[10px] font-semibold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full">Obrigatório</span>
                        )}
                      </label>
                      {/* Toggle obrigatório */}
                      <button
                        type="button"
                        onClick={() => handleToggleRequired(si, fi)}
                        title={fld.is_required ? 'Desmarcar obrigatório' : 'Marcar como obrigatório'}
                        className="p-1 rounded text-gray-300 hover:text-amber-500 transition"
                      >
                        <Settings size={12} />
                      </button>
                      {/* Remover campo */}
                      <button
                        type="button"
                        onClick={() => handleRemoveField(si, fi)}
                        className="p-1 rounded text-gray-300 hover:text-red-500 transition"
                        title="Remover campo"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>

                    {/* Renderer */}
                    <FieldRenderer
                      field={fld}
                      isRequired={fld.is_required}
                      showError={hasErr}
                      onChange={v => handleFieldChange(si, fi, v)}
                    />
                  </div>
                );
              })}

              {/* Adicionar campo */}
              <button
                onClick={() => setAddFieldForIndex(si)}
                className="flex items-center gap-1.5 text-xs font-semibold mt-2 px-3 py-2 rounded-lg border transition"
                style={{ borderColor: colors.border, color: colors.petrol, background: colors.bg }}
              >
                <Plus size={13} /> Adicionar campo
              </button>
            </div>
          )}
        </div>
      ))}

      {/* ── Estado vazio ── */}
      {!loading && sections.length === 0 && (
        <div
          className="rounded-2xl py-14 text-center"
          style={{ border: `2px dashed ${colors.border}`, background: '#FAFAF8' }}
        >
          <Heart size={32} className="mx-auto mb-3 text-gray-200" />
          <p className="text-sm font-semibold text-gray-400 mb-1">Nenhuma seção cadastrada</p>
          <p className="text-xs text-gray-300">Clique em "Adicionar seção" para começar.</p>
        </div>
      )}

      {/* ── Botões de ação ── */}
      {!loading && (
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setShowAddSection(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border transition"
            style={{ borderColor: colors.petrol, color: colors.petrol, background: '#fff' }}
          >
            <Plus size={15} /> Adicionar seção
          </button>

          <button
            onClick={() => handleSave(false)}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition"
            style={{ background: saving ? '#9CA3AF' : colors.petrol }}
          >
            {saving ? (
              <><span className="animate-spin">⏳</span> Salvando…</>
            ) : saved ? (
              <><Check size={15} /> Salvo!</>
            ) : (
              <><Save size={15} /> Salvar</>
            )}
          </button>

          {sections.length > 0 && !saving && !saved && (
            <span className="text-xs text-gray-400">Lembre-se de salvar as alterações</span>
          )}
        </div>
      )}

      {/* ── Modais ── */}
      {showAddSection && (
        <AddSectionModal
          usedTitles={usedTitles}
          onSelect={handleAddSection}
          onClose={() => setShowAddSection(false)}
        />
      )}

      {addFieldForIndex !== null && (
        <AddFieldModal
          onAdd={field => handleAddField(addFieldForIndex, field)}
          onClose={() => setAddFieldForIndex(null)}
        />
      )}

      {requiredAlert && (
        <RequiredAlert
          fieldLabels={requiredAlert.labels}
          onBack={() => { setRequiredAlert(null); setPendingSaveForce(false); }}
          onSaveAnyway={() => { setRequiredAlert(null); handleSave(true); }}
        />
      )}
    </div>
  );
};
