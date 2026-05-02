import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles, Download, RefreshCw, History, UserCheck,
  BookOpen, Lightbulb, Puzzle, Eye, Brain, CheckCircle,
  Activity, Star, Target, Stethoscope, X, ChevronRight,
  AlertCircle, User, Map,
} from 'lucide-react';
import { Student, User as UserType } from '../types';
import { AIService, friendlyAIError } from '../services/aiService';
import {
  IntelligentProfileService,
  IntelligentProfileRecord,
  IntelligentProfileJSON,
  ChecklistItem,
} from '../services/intelligentProfileService';
import { calculateAge } from '../utils/dateUtils';

interface Props {
  student: Student;
  user: UserType;
  onNavigateToIncluiLab?: (prompt: string) => void;
}

// ── Version history modal ─────────────────────────────────────────────────────
function VersionModal({ versions, onClose, onSelect }: {
  versions: IntelligentProfileRecord[];
  onClose: () => void;
  onSelect: (v: IntelligentProfileRecord) => void;
}) {
  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="bg-[#1F4E5F] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <History size={18} className="text-white" />
            <span className="text-white font-bold text-base">Histórico de Versões</span>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {versions.map((v) => {
            const date = new Date(v.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const time = new Date(v.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            return (
              <button key={v.id} onClick={() => { onSelect(v); onClose(); }}
                className="w-full text-left px-6 py-4 border-b border-slate-100 hover:bg-slate-50 transition-colors">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-sm text-[#1F4E5F]">Versão {v.version_number}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${v.generation_type === 'initial' ? 'bg-indigo-50 text-indigo-700' : 'bg-amber-50 text-amber-700'}`}>
                        {v.generation_type === 'initial' ? 'Geração inicial' : 'Atualização'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">{date} às {time} · {v.generated_by_name || 'Usuário'}</p>
                    {v.summary && <p className="text-xs text-slate-600 mt-1 italic">{v.summary}</p>}
                  </div>
                  <ChevronRight size={16} className="text-slate-300 mt-1 shrink-0" />
                </div>
              </button>
            );
          })}
        </div>
        <div className="px-6 py-3 border-t border-slate-100">
          <button onClick={onClose} className="w-full py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Checklist item (empty checkbox, printable) ────────────────────────────────
function PrintCheckItem({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2.5 text-sm text-slate-700">
      <div className="w-4 h-4 rounded border border-slate-300 bg-white mt-0.5 shrink-0" />
      <span className="leading-tight">{text}</span>
    </li>
  );
}

// ── Checklist sub-box inside a Parecer card ───────────────────────────────────
function ChecklistBox({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-auto bg-slate-50 rounded-xl p-4 border border-slate-100">
      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
        <div className="w-3.5 h-3.5 border border-slate-400 rounded-sm" />
        {title}
      </h4>
      <ul className="space-y-2">
        {items.map((item, i) => <PrintCheckItem key={i} text={item} />)}
      </ul>
    </div>
  );
}

// ── Status checklist (for Pedagógico / Neuropedagógico) ───────────────────────
const STATUS_CFG: Record<ChecklistItem['status'], { color: string; label: string }> = {
  presente:          { color: 'text-emerald-600', label: 'Presente' },
  em_desenvolvimento:{ color: 'text-amber-500',   label: 'Em desenvolvimento' },
  nao_observado:     { color: 'text-slate-400',   label: 'Não observado' },
};

function StatusChecklistBox({ title, items }: { title: string; items: ChecklistItem[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-auto bg-slate-50 rounded-xl p-4 border border-slate-100">
      <div className="flex flex-wrap gap-3 mb-3">
        {(['presente', 'em_desenvolvimento', 'nao_observado'] as ChecklistItem['status'][]).map(s => (
          <div key={s} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${s === 'presente' ? 'bg-emerald-500' : s === 'em_desenvolvimento' ? 'bg-amber-400' : 'bg-slate-300'}`} />
            <span className="text-[10px] text-slate-500">{STATUS_CFG[s].label}</span>
          </div>
        ))}
      </div>
      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{title}</h4>
      <div>
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2.5 py-1.5 border-b border-slate-100 last:border-0">
            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${item.status === 'presente' ? 'bg-emerald-500' : item.status === 'em_desenvolvimento' ? 'bg-amber-400' : 'bg-slate-300'}`} />
            <span className="flex-1 text-[12px] text-slate-700">{item.label}</span>
            <span className={`text-[10px] font-medium ${STATUS_CFG[item.status].color}`}>
              {STATUS_CFG[item.status].label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export const IntelligentProfileTab: React.FC<Props> = ({ student, user, onNavigateToIncluiLab: _onNavigateToIncluiLab }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingInit, setLoadingInit]   = useState(true);
  const [error, setError]               = useState('');
  const [profile, setProfile]           = useState<IntelligentProfileRecord | null>(null);
  const [versions, setVersions]         = useState<IntelligentProfileRecord[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const reportReady = !isGenerating && !!profile;

  const loadData = useCallback(async () => {
    if (!student.id) { setLoadingInit(false); return; }
    setLoadingInit(true);
    try {
      const [latest, all] = await Promise.all([
        IntelligentProfileService.getLatest(student.id),
        IntelligentProfileService.getVersions(student.id),
      ]);
      setProfile(latest);
      setVersions(all);
    } catch (e) {
      console.error('[IntelligentProfileTab] load:', e);
    } finally {
      setLoadingInit(false);
    }
  }, [student.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleGenerate = async (isUpdate: boolean) => {
    setError('');
    setIsGenerating(true);
    try {
      const newVersion = isUpdate ? (profile?.version_number ?? 0) + 1 : 1;
      const profileJson = await AIService.generateIntelligentProfile(student, user as any, newVersion);
      const saved = await IntelligentProfileService.save({
        studentId: student.id,
        tenantId: (user as any).tenant_id ?? '',
        generatedBy: user.id,
        generatedByName: user.name,
        profileJson,
        generationType: isUpdate ? 'update' : 'initial',
        summary: isUpdate ? 'Perfil atualizado com novos dados' : undefined,
        versionNumber: newVersion,
      });
      if (!saved) throw new Error('Não foi possível salvar o perfil. Tente novamente.');
      await loadData();
    } catch (e: any) {
      setError(friendlyAIError(e));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportPdf = async () => {
    if (!profile) return;
    setExportingPdf(true);
    try {
      const { generateIntelligentProfilePDF } = await import('../services/PDFGenerator');
      await generateIntelligentProfilePDF({
        profile: profile.profile_json,
        student,
        versionNumber: profile.version_number,
        generatedAt: profile.created_at,
        generatedByName: profile.generated_by_name ?? user.name,
        school: (user as any)?.schoolConfigs?.[0] ?? null,
      });
    } catch (e) {
      console.error('[IntelligentProfileTab] PDF error:', e);
      alert('Erro ao gerar PDF. Tente novamente.');
    } finally {
      setExportingPdf(false);
    }
  };

  // ── Computed data helpers ──────────────────────────────────────────────────
  const data: IntelligentProfileJSON | null = profile?.profile_json ?? null;
  const age  = student.birthDate ? calculateAge(student.birthDate) : null;
  const diagnosis = (student.diagnosis || []).join(', ') || student.cid?.[0] || '';

  const genDate = profile
    ? new Date(profile.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '';

  // Backward-compat fallbacks
  const firstPersonLetter     = data?.firstPersonLetter || null;
  const neuropsychological    = data?.neuropsychologicalReport ?? null;
  const learningProfile       = data?.learningProfile ?? null;
  const strengths             = data?.strengths ?? data?.nextSteps ?? [];
  const challenges            = data?.challenges ?? (data?.carePoints ?? []).map(c => ({ title: 'Ponto de Atenção', description: c }));

  // ── Loading init ──────────────────────────────────────────────────────────
  if (loadingInit) {
    return (
      <div className="flex items-center justify-center gap-3 py-24 text-slate-400">
        <RefreshCw size={20} className="animate-spin" />
        <span className="text-sm">Carregando perfil…</span>
      </div>
    );
  }

  // ── Student header (sempre visível) ──────────────────────────────────────
  const studentHeader = (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 mb-6 flex flex-col md:flex-row items-start md:items-center gap-6 print:shadow-none print:border-slate-300">
      <div className="relative shrink-0">
        {student.photoUrl ? (
          <img src={student.photoUrl} alt={student.name}
            className="w-24 h-24 rounded-full bg-slate-100 border-4 border-white shadow-md print:shadow-none object-cover" />
        ) : (
          <div className="w-24 h-24 rounded-full bg-indigo-50 border-4 border-white shadow-md flex items-center justify-center text-3xl font-bold text-indigo-600 print:shadow-none">
            {student.name.charAt(0)}
          </div>
        )}
        <div className="absolute bottom-0.5 right-0.5 w-5 h-5 bg-green-500 border-2 border-white rounded-full print:hidden" title="Ativo no sistema" />
      </div>
      <div className="flex-1">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">{student.name}</h1>
        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
          {age !== null && age > 0 && (
            <span className="flex items-center gap-1"><User size={15} /> {age} anos</span>
          )}
          {student.grade && (
            <span className="flex items-center gap-1"><Map size={15} /> {student.grade}</span>
          )}
          {diagnosis && (
            <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full font-medium text-xs print:border print:border-indigo-200">
              <Brain size={13} /> {diagnosis}
            </span>
          )}
        </div>
      </div>
    </div>
  );

  // ── Empty state ───────────────────────────────────────────────────────────
  if (!data) {
    return (
      <div>
        {studentHeader}
        <div className="bg-white rounded-2xl p-12 shadow-sm border border-slate-100 flex flex-col items-center text-center">
          <div className="animate-pulse relative mb-8">
            <div className="w-24 h-24 rounded-3xl bg-indigo-50 flex items-center justify-center shadow-[0_0_0_14px_rgba(99,102,241,0.07)]">
              <Brain size={48} className="text-indigo-600" />
            </div>
            <div className="absolute -top-1 -right-1 w-8 h-8 rounded-full bg-amber-400 flex items-center justify-center shadow-md">
              <Sparkles size={14} className="text-white" />
            </div>
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-3">Entenda este aluno além do diagnóstico</h3>
          <p className="text-sm text-slate-500 mb-8 max-w-md leading-relaxed">
            A IA analisa comportamento, aprendizagem e histórico para gerar um perfil pedagógico completo,
            com parecer neuropedagógico, atividades personalizadas e orientações práticas.
          </p>
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 mb-6 max-w-md text-left">
              <AlertCircle size={15} className="text-red-500 shrink-0 mt-0.5" />
              <span className="text-sm text-red-600">{error}</span>
            </div>
          )}
          <button onClick={() => handleGenerate(false)} disabled={isGenerating}
            className="flex items-center gap-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold px-10 py-4 rounded-2xl text-sm shadow-md shadow-indigo-200 transition-all">
            {isGenerating ? <RefreshCw size={17} className="animate-spin" /> : <Sparkles size={17} />}
            {isGenerating ? 'Gerando perfil com IA…' : 'Gerar análise completa do aluno'}
          </button>
          <p className="text-xs text-slate-400 mt-3">Custo: <strong>5 créditos</strong></p>
        </div>
      </div>
    );
  }

  // ── Full report view ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pb-12 -mx-6 px-6">

      {/* Student header */}
      {studentHeader}

      {/* Action bar */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 bg-gradient-to-r from-indigo-50 to-purple-50 p-6 rounded-2xl border border-indigo-100 shadow-sm mb-6 print:hidden">
        <div>
          <span className="inline-block text-[11px] bg-indigo-200/70 text-indigo-800 px-2.5 py-1 rounded-md uppercase font-bold tracking-wider mb-3">
            Perfil humanizado com IA
          </span>
          <h2 className="text-2xl font-bold text-indigo-950 flex items-center gap-2 mb-2">
            <Sparkles className="text-indigo-600" size={22} />
            Quem sou eu?
          </h2>
          <p className="text-sm text-indigo-800/80 max-w-2xl leading-relaxed">
            Relatório neuropedagógico e pedagógico gerado em <strong>{genDate}</strong>
            {versions.length > 1 && <span> · Versão {profile.version_number} de {versions.length}</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto items-start">
          <button onClick={() => handleGenerate(true)} disabled={isGenerating}
            className="flex-1 md:flex-none justify-center flex items-center gap-2 px-4 py-2.5 bg-white text-indigo-600 hover:bg-indigo-50 border border-indigo-200 rounded-xl font-semibold text-sm transition-all disabled:opacity-50">
            <RefreshCw size={15} className={isGenerating ? 'animate-spin' : ''} />
            {isGenerating ? 'Processando…' : 'Atualizar'}
          </button>
          {versions.length > 1 && (
            <button onClick={() => setShowVersions(true)}
              className="flex-1 md:flex-none justify-center flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-sm transition-all border border-slate-200">
              <History size={15} />
              Versões
            </button>
          )}
          <button onClick={handleExportPdf} disabled={exportingPdf}
            className="flex-1 md:flex-none justify-center flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm transition-all shadow-sm shadow-indigo-200 disabled:opacity-60">
            {exportingPdf ? <RefreshCw size={15} className="animate-spin" /> : <Download size={15} />}
            Gerar PDF
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 mb-6">
          <AlertCircle size={15} className="text-red-500 shrink-0 mt-0.5" />
          <span className="text-sm text-red-600">{error}</span>
        </div>
      )}

      {/* Loading overlay */}
      {isGenerating && (
        <div className="py-20 flex flex-col items-center justify-center text-center animate-pulse">
          <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-4">
            <Sparkles className="text-indigo-600 w-8 h-8 animate-bounce" />
          </div>
          <h3 className="text-xl font-medium text-slate-800 mb-2">A IA está analisando os dados de {student.name}…</h3>
          <p className="text-slate-500 max-w-md text-sm leading-relaxed">
            Cruzando observações de sala de aula, relatórios de terapeutas e avaliações para criar um perfil único.
          </p>
        </div>
      )}

      {/* Report content */}
      {!isGenerating && (
        <div className="space-y-8 print:space-y-6">

          {/* ── Carta em 1ª pessoa ── */}
          <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-7 shadow-md text-white border border-indigo-400 print:bg-white print:border-slate-300 print:text-slate-900 print:shadow-none">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center shrink-0 border border-white/30 print:bg-indigo-100">
                <UserCheck size={24} className="text-white print:text-indigo-700" />
              </div>
              <h3 className="text-2xl font-bold">Quem sou eu?</h3>
            </div>
            <p className="text-indigo-50 leading-relaxed text-base italic font-medium print:text-slate-700">
              {firstPersonLetter || `"${data.humanizedIntroduction.text.split('.')[0]}…"`}
            </p>
          </div>

          {/* ── Divider ── */}
          <div className="flex items-center gap-4 py-2">
            <div className="flex-1 h-px bg-slate-200" />
            <h2 className="text-xl font-extrabold text-slate-800 uppercase tracking-wide text-center whitespace-nowrap">
              Agora eu te conto sobre {student.name.split(' ')[0]}
            </h2>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          {/* ── Grid de cards ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 print:grid-cols-2">

            {/* 1. Parecer Neuropsicológico */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col print:shadow-none print:break-inside-avoid">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                  <Stethoscope size={20} />
                </div>
                <h3 className="text-lg font-bold text-slate-800">Parecer Neuropsicológico</h3>
              </div>
              <p className="text-slate-600 text-sm leading-relaxed mb-4">
                {neuropsychological?.text || data.neuroPedagogicalReport.text}
              </p>
              <ChecklistBox
                title="Checklist Terapêutico"
                items={neuropsychological?.checklist || (data.neuroPedagogicalReport.checklist.slice(0, 4).map(c => c.label))}
              />
            </div>

            {/* 2. Parecer Pedagógico Educacional */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col print:shadow-none print:break-inside-avoid">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <BookOpen size={20} />
                </div>
                <h3 className="text-lg font-bold text-slate-800">Parecer Pedagógico Educacional</h3>
              </div>
              <p className="text-slate-600 text-sm leading-relaxed mb-4">{data.pedagogicalReport.text}</p>
              <ChecklistBox
                title="Checklist de Adaptação"
                items={data.pedagogicalReport.checklist.slice(0, 4).map(c => c.label)}
              />
            </div>

            {/* 3. Parecer Neuropedagógico */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col print:shadow-none print:break-inside-avoid">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
                  <Puzzle size={20} />
                </div>
                <h3 className="text-lg font-bold text-slate-800">Parecer Neuropedagógico</h3>
              </div>
              <p className="text-slate-600 text-sm leading-relaxed mb-4">{data.neuroPedagogicalReport.text}</p>
              <StatusChecklistBox
                title="Indicadores Neuropedagógicos"
                items={data.neuroPedagogicalReport.checklist.slice(0, 5)}
              />
            </div>

            {/* 4. Perfil de Aprendizagem */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col print:shadow-none print:break-inside-avoid">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center shrink-0">
                  <Brain size={20} />
                </div>
                <h3 className="text-lg font-bold text-slate-800">Perfil de Aprendizagem</h3>
              </div>
              <div className="text-slate-600 text-sm leading-relaxed space-y-3">
                {learningProfile ? (
                  <>
                    <p>{learningProfile.text}</p>
                    {learningProfile.attentionSpan && (
                      <p>Seu tempo de atenção sustentada máxima é de <strong>{learningProfile.attentionSpan}</strong> contínuos.</p>
                    )}
                  </>
                ) : (
                  <p>{data.bestLearningStrategies.text}</p>
                )}
              </div>
            </div>

            {/* 5. Como aprende melhor */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col print:shadow-none print:break-inside-avoid">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center shrink-0">
                  <Lightbulb size={20} />
                </div>
                <h3 className="text-lg font-bold text-slate-800">Como aprende melhor</h3>
              </div>
              <ul className="space-y-3">
                {data.bestLearningStrategies.items.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                    <CheckCircle size={15} className="text-amber-500 mt-0.5 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* 6. Atividades Indicadas */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col print:shadow-none print:break-inside-avoid">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <Activity size={20} />
                </div>
                <h3 className="text-lg font-bold text-slate-800">Atividades Indicadas</h3>
              </div>
              <ul className="space-y-3">
                {data.recommendedActivities.map((act, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                    <CheckCircle size={15} className="text-indigo-500 mt-0.5 shrink-0" />
                    <span>{act.title}{act.objective ? ` — ${act.objective}` : ''}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* 7. Potencialidades (wide) */}
            <div className="col-span-1 md:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-slate-200 print:shadow-none print:break-inside-avoid">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <Star size={20} />
                </div>
                <h3 className="text-lg font-bold text-slate-800">Potencialidades</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {strengths.map((item, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-slate-600">
                    <CheckCircle size={15} className="text-emerald-500 mt-0.5 shrink-0" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 8. Desafios e Barreiras (wide) */}
            {challenges.length > 0 && (
              <div className="col-span-1 md:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-slate-200 print:shadow-none print:break-inside-avoid">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-red-50 text-red-500 flex items-center justify-center shrink-0">
                    <Target size={20} />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800">Desafios e Barreiras Identificadas</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {challenges.slice(0, 3).map((c, i) => (
                    <div key={i} className="border-l-4 border-red-200 pl-4">
                      <h4 className="text-sm font-bold text-slate-800 mb-1">{c.title}</h4>
                      <p className="text-sm text-slate-600">{c.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 9. O que observar (wide) */}
            <div className="col-span-1 md:col-span-2 bg-amber-50/40 rounded-2xl p-6 shadow-sm border border-amber-200/60 print:border-slate-200 print:bg-white print:shadow-none print:break-inside-avoid">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                  <Eye size={20} />
                </div>
                <h3 className="text-lg font-bold text-slate-800">O que observar nas próximas semanas</h3>
              </div>
              <p className="text-slate-700 leading-relaxed md:ml-[52px]">
                {data.observationPoints.text}
              </p>
              {data.observationPoints.checklist.length > 0 && (
                <ul className="mt-4 md:ml-[52px] space-y-2">
                  {data.observationPoints.checklist.map((item, i) => (
                    <li key={i} className="flex items-center gap-2.5 text-sm text-slate-700">
                      <div className="w-4 h-4 rounded border border-slate-300 bg-white shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </div>

          </div>{/* end grid */}

          {/* ── Assinaturas ── */}
          <div className="mt-16 pt-10 border-t-2 border-slate-200 print:mt-12 print:break-inside-avoid">
            <h3 className="text-center text-sm font-bold text-slate-400 uppercase tracking-widest mb-12">
              Assinaturas e Ciência da Equipe
            </h3>
            <div className="flex flex-wrap justify-center md:justify-between gap-y-12 gap-x-6 text-center">
              {['Professor(a) Regente', 'Profissional de AEE', 'Neuropedagogo(a)', 'Coordenação', 'Gestão Escolar'].map((label) => (
                <div key={label} className="flex flex-col items-center w-full sm:w-1/3 md:flex-1">
                  <div className="w-4/5 border-b border-slate-400 mb-3" />
                  <span className="font-bold text-slate-800 text-sm">{label}</span>
                </div>
              ))}
            </div>
            <div className="text-center mt-12 text-xs text-slate-400 font-medium">
              Documento validado e gerado pelo sistema IncluiAI em {genDate}.
            </div>
          </div>

        </div>
      )}

      {/* Version modal */}
      {showVersions && (
        <VersionModal
          versions={versions}
          onClose={() => setShowVersions(false)}
          onSelect={(v) => setProfile(v)}
        />
      )}
    </div>
  );
};
