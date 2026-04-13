import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Student, Protocol, DocumentType, PlanTier, ServiceRecord, Appointment,
  DocumentAnalysis, FichaComplementar, StudentEvolution, User as UserType,
} from '../types';
import {
  User, Calendar, FileText, Activity, Brain,
  ShieldCheck, Clock, Edit, ArrowLeft, Eye,
  Printer, CheckCircle, FilePlus, AlertCircle, Save, Sparkles, FileSearch,
  ClipboardCheck, Trash2, X, Download, Paperclip, BookOpen, BarChart2,
  TrendingUp, Users, Tag, Send, LogOut, Zap, Image, Copy, RefreshCw,
} from 'lucide-react';
import { SmartTextarea } from './SmartTextarea';
import { AIService } from '../services/aiService';
import { ExportService } from '../services/exportService';
import { databaseService } from '../services/databaseService';
import { PDFGenerator } from '../services/PDFGenerator';
import { StorageService } from '../services/storageService';
import {
  StudentDocumentService, MedicalReportService, TimelineService,
  ObservationFormService, StudentProfileService, GeneratedActivityService,
} from '../services/persistenceService';
import { DEMO_MODE } from '../services/supabase';
import { QuickDocModal, QuickDocType } from './QuickDocModal';

// ── Critérios do perfil evolutivo (10 dimensões) ─────────────────────────────
const CRITERIA = [
  { name: 'Comunicação Expressiva',  desc: 'Expressão verbal, gestual ou alternativa.' },
  { name: 'Interação Social',        desc: 'Qualidade das trocas com pares e adultos.' },
  { name: 'Autonomia (AVD)',         desc: 'Independência em atividades de vida diária.' },
  { name: 'Autorregulação',          desc: 'Gerenciamento de emoções e frustrações.' },
  { name: 'Atenção Sustentada',      desc: 'Foco e conclusão de tarefas.' },
  { name: 'Compreensão',             desc: 'Entender instruções e conteúdos.' },
  { name: 'Motricidade Fina',        desc: 'Escrita, recorte, encaixe, manipulação.' },
  { name: 'Motricidade Grossa',      desc: 'Equilíbrio, coordenação e deslocamento.' },
  { name: 'Participação',            desc: 'Engajamento nas atividades e rotina.' },
  { name: 'Linguagem/Leitura',       desc: 'Evolução em leitura e escrita.' },
];

// ── Gráfico Radar SVG ─────────────────────────────────────────────────────────
const RadarChart: React.FC<{ scores: number[]; size?: number }> = ({ scores, size = 260 }) => {
  const n = scores.length;
  const cx = size / 2, cy = size / 2;
  const R = size * 0.36;
  const angle = (i: number) => (i * 2 * Math.PI) / n - Math.PI / 2;
  const pt = (i: number, r: number) => `${cx + r * Math.cos(angle(i))},${cy + r * Math.sin(angle(i))}`;
  const polygon = scores.map((s, i) => pt(i, (s / 5) * R)).join(' ');
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {[0.2, 0.4, 0.6, 0.8, 1].map(f => (
        <polygon key={f}
          points={Array.from({ length: n }, (_, i) => pt(i, R * f)).join(' ')}
          fill="none" stroke="#e5e7eb" strokeWidth="1"
        />
      ))}
      {Array.from({ length: n }, (_, i) => (
        <line key={i} x1={cx} y1={cy}
          x2={cx + R * Math.cos(angle(i))} y2={cy + R * Math.sin(angle(i))}
          stroke="#d1d5db" strokeWidth="1"
        />
      ))}
      <polygon points={polygon} fill="rgba(139,92,246,0.18)" stroke="#7c3aed" strokeWidth="2.5" strokeLinejoin="round" />
      {scores.map((s, i) => {
        const r = (s / 5) * R;
        return <circle key={i} cx={cx + r * Math.cos(angle(i))} cy={cy + r * Math.sin(angle(i))} r={4} fill="#7c3aed" />;
      })}
    </svg>
  );
};

// ── Gráfico Barras SVG ────────────────────────────────────────────────────────
const EvoBarChart: React.FC<{ scores: number[]; labels: string[] }> = ({ scores, labels }) => {
  const H = 100, W = 440, pad = 4;
  const barW = (W - pad * (scores.length + 1)) / scores.length;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H + 24}`} className="overflow-visible">
      {scores.map((s, i) => {
        const h = (s / 5) * H;
        const x = pad + i * (barW + pad);
        const y = H - h;
        const pct = Math.round((s / 5) * 100);
        const color = s >= 4 ? '#16a34a' : s >= 3 ? '#7c3aed' : s >= 2 ? '#d97706' : '#dc2626';
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={h} rx={3} fill={color} opacity={0.82} />
            <text x={x + barW / 2} y={y - 2} textAnchor="middle" fontSize={8} fill={color} fontWeight="bold">{pct}%</text>
            <text x={x + barW / 2} y={H + 14} textAnchor="middle" fontSize={7} fill="#6b7280">{labels[i]?.substring(0, 6)}</text>
          </g>
        );
      })}
    </svg>
  );
};

// ── Tag Chip ──────────────────────────────────────────────────────────────────
const Tag_: React.FC<{ label: string; color: 'green' | 'orange' | 'blue' | 'purple' }> = ({ label, color }) => {
  const palettes = {
    green:  'bg-green-50 text-green-700 border-green-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    blue:   'bg-blue-50 text-blue-700 border-blue-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
  };
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${palettes[color]}`}>
      {label}
    </span>
  );
};

// ── Section Header ────────────────────────────────────────────────────────────
const SectionHeader: React.FC<{ icon: React.ReactNode; title: string; subtitle?: string }> = ({ icon, title, subtitle }) => (
  <div className="flex items-center gap-3 pb-3 mb-5 border-b border-gray-100">
    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#EFF9FF' }}>{icon}</div>
    <div>
      <h3 className="font-bold text-gray-800 text-sm">{title}</h3>
      {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
    </div>
  </div>
);

// ── InfoRow ───────────────────────────────────────────────────────────────────
const InfoRow: React.FC<{ label: string; value?: string | null }> = ({ label, value }) => {
  if (!value) return null;
  return (
    <div className="flex justify-between items-start gap-4 py-1.5 border-b border-gray-50">
      <span className="text-gray-500 text-xs shrink-0">{label}</span>
      <span className="font-semibold text-gray-800 text-xs text-right">{value}</span>
    </div>
  );
};

// ── Props ─────────────────────────────────────────────────────────────────────
interface StudentProfileProps {
  student: Student;
  protocols: Protocol[];
  onBack: () => void;
  onEdit: () => void;
  onViewProtocol: (protocol: Protocol) => void;
  onCreateDerived?: (sourceProtocol: Protocol, targetType: DocumentType) => void;
  userPlan?: PlanTier;
  user?: UserType;
  serviceRecords?: ServiceRecord[];
  appointments?: Appointment[];
  onAddServiceRecord?: (record: ServiceRecord) => void;
  onUpdateStudent?: (s: Student) => void;
  onNavigateTo?: (view: string) => void; // para abrir FichasComplementaresView
  onRefreshProtocols?: () => Promise<void>;
}

// ── Main Component ────────────────────────────────────────────────────────────
export const StudentProfile: React.FC<StudentProfileProps> = ({
  student,
  protocols,
  onBack,
  onEdit,
  onViewProtocol,
  userPlan = PlanTier.FREE,
  user,
  serviceRecords = [],
  appointments = [],
  onUpdateStudent,
  onNavigateTo,
  onRefreshProtocols,
}) => {
  type Tab = 'ficha' | 'evolucao' | 'agenda' | 'documentos' | 'timeline' | 'atividades';
  const [activeTab, setActiveTab] = useState<Tab>('ficha');
  const [fichas, setFichas] = useState<FichaComplementar[]>(student.fichasComplementares || []);
  const [quickDocType, setQuickDocType] = useState<QuickDocType | null>(null);

  // ── Documentos: carregados do banco (student_documents), não do student.documents legado ──
  const [dbDocs, setDbDocs] = useState<any[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);

  const loadDbDocs = useCallback(async () => {
    if (!student.id) return;
    setLoadingDocs(true);
    try {
      const rows = await StudentDocumentService.getForStudent(student.id);
      const bankDocs = rows.map((r: any) => ({
        id:   r.id,
        name: r.name,
        date: r.created_at ? new Date(r.created_at).toLocaleDateString('pt-BR') : '',
        type: r.document_type ?? 'Laudo',
        url:  r.file_url  ?? undefined,
        path: r.file_path ?? undefined,
        fromBank: true,
      }));

      // Merge documentos legados (student.documents) que ainda não estejam no banco
      const bankNames = new Set(bankDocs.map((d: any) => d.name));
      const legacyDocs = (student.documents ?? [])
        .filter((d) => d?.name && !bankNames.has(d.name))
        .map((d, i) => ({
          id:   (d as any).id ?? `legacy_${i}`,
          name: d.name,
          date: d.date ?? '',
          type: d.type ?? 'Laudo',
          url:  d.url ?? undefined,
          path: d.path ?? undefined,
          fromBank: false,
        }));

      setDbDocs([...bankDocs, ...legacyDocs]);
    } catch (err) {
      console.error('[StudentProfile] loadDbDocs error:', err);
    } finally {
      setLoadingDocs(false);
    }
  }, [student.id, student.documents]);

  useEffect(() => { loadDbDocs(); }, [loadDbDocs]);

  // ── Dados do banco: fichas de observação, perfis cognitivos, laudos, linha do tempo ──
  const [dbObsForms, setDbObsForms]             = useState<any[]>([]);
  const [dbCogProfiles, setDbCogProfiles]       = useState<any[]>([]);
  const [dbTimeline, setDbTimeline]             = useState<any[]>([]);
  const [dbMedicalReports, setDbMedicalReports] = useState<any[]>([]);
  const [dbActivities, setDbActivities]         = useState<any[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);

  useEffect(() => {
    if (!student.id) return;
    ObservationFormService.getForStudent(student.id)
      .then(setDbObsForms)
      .catch(e => console.error('[StudentProfile] obs_forms load:', e));
    StudentProfileService.getForStudent(student.id)
      .then(setDbCogProfiles)
      .catch(e => console.error('[StudentProfile] cog_profiles load:', e));
    TimelineService.getForStudent(student.id)
      .then(setDbTimeline)
      .catch(e => console.error('[StudentProfile] timeline load:', e));
    MedicalReportService.getForStudent(student.id)
      .then(setDbMedicalReports)
      .catch(e => console.error('[StudentProfile] medical_reports load:', e));
  }, [student.id]);

  // Carrega atividades geradas ao abrir a aba (lazy load)
  useEffect(() => {
    if (activeTab !== 'atividades' || !student.id) return;
    setLoadingActivities(true);
    GeneratedActivityService.getForStudent(student.id)
      .then(setDbActivities)
      .catch(e => console.error('[StudentProfile] activities load:', e))
      .finally(() => setLoadingActivities(false));
  }, [activeTab, student.id]);

  // Converte student_profiles rows → formato StudentEvolution (para reutilizar gráficos)
  const dbEvolutions = dbCogProfiles.map((p: any) => ({
    id:          p.id,
    date:        p.evaluated_at ? `${p.evaluated_at}T00:00:00` : p.created_at,
    createdAt:   p.created_at,
    createdBy:   p.evaluated_by ?? 'Profissional',
    author:      p.evaluated_by ?? 'Profissional',
    observation: p.observation ?? '',
    scores: [
      p.comunicacao_expressiva ?? 1, p.interacao_social    ?? 1,
      p.autonomia_avd          ?? 1, p.autorregulacao      ?? 1,
      p.atencao_sustentada     ?? 1, p.compreensao         ?? 1,
      p.motricidade_fina       ?? 1, p.motricidade_grossa  ?? 1,
      p.participacao           ?? 1, p.linguagem_leitura   ?? 1,
    ],
    customFields: [],
  }));

  // Usa dados do banco quando disponíveis; senão, usa legacy student.evolutions[]
  const effectiveEvolutions = dbEvolutions.length > 0
    ? dbEvolutions
    : [...(student.evolutions ?? [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // doc upload
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [docUploadType, setDocUploadType] = useState<'Laudo' | 'Relatorio' | 'Outro'>('Laudo');
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [docPreview, setDocPreview] = useState<{ name: string; url: string } | null>(null);

  // doc analysis
  const [analyzingDocId, setAnalyzingDocId] = useState<string | null>(null);
  const [analyses, setAnalyses] = useState<DocumentAnalysis[]>(student.documentAnalyses || []);

  // history edit
  const [historyText, setHistoryText] = useState((student.schoolHistory || student.history || '') as string);
  const [isSavingHistory, setIsSavingHistory] = useState(false);

  const studentProtocols = protocols.filter(p => p.studentId === student.id);

  const calculateAge = (dob: string) => {
    const diff = Date.now() - new Date(dob).getTime();
    return Math.abs(new Date(diff).getUTCFullYear() - 1970);
  };

  const handleDownloadFiche = () => {
    const school = user?.schoolConfigs?.[0] ?? null;
    // Sempre usa a ficha atual do aluno (dados mais recentes)
    ExportService.generateStudentProfilePDF(student, user?.name || 'Sistema', school);
  };

  // ── Geração em Lote ────────────────────────────────────────────────────────
  const BATCH_TYPES: { id: DocumentType; label: string; order: number }[] = [
    { id: 'ESTUDO_DE_CASO' as any, label: 'Estudo de Caso', order: 1 },
    { id: 'PAEE'           as any, label: 'PAEE',           order: 2 },
    { id: 'PEI'            as any, label: 'PEI',            order: 3 },
  ];
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchSelected, setBatchSelected] = useState<string[]>(['ESTUDO_DE_CASO', 'PAEE', 'PEI']);
  const [batchProgress, setBatchProgress] = useState<{ type: string; status: 'pending' | 'generating' | 'done' | 'error'; msg?: string }[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchToast, setBatchToast] = useState('');

  const handleDeleteProtocol = async (id: string) => {
    if (!window.confirm('Excluir este documento? Esta ação não pode ser desfeita.')) return;
    try {
      await databaseService.deleteDocument(id);
      await onRefreshProtocols?.();
    } catch (err) {
      console.error('[deleteDocument]', err);
      alert('Erro ao excluir documento.');
    }
  };

  const handleBatchGenerate = async () => {
    if (!user || !batchSelected.length) return;
    const ordered = BATCH_TYPES.filter(t => batchSelected.includes(t.id as string)).sort((a, b) => a.order - b.order);
    setBatchProgress(ordered.map(t => ({ type: t.id as string, status: 'pending' })));
    setBatchRunning(true);

    const schoolCfg = (user as any).schoolConfigs?.[0] ?? null;

    for (let i = 0; i < ordered.length; i++) {
      const t = ordered[i];
      setBatchProgress(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'generating' } : p));
      try {
        const jsonStr = await AIService.generateProtocolJSON(t.id, student, user as any);
        const parsed = JSON.parse(jsonStr);
        const sections = parsed?.sections ?? [];

        // Gera código de auditoria único para este documento
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let rand = '';
        for (let k = 0; k < 8; k++) rand += chars.charAt(Math.floor(Math.random() * chars.length));
        const auditCode = `${rand}-${(user as any).name?.split(' ')[0]?.toUpperCase() ?? 'INC'}-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '')}`;

        // Salva DRAFT no banco com structuredData correto para que o DocumentBuilder consiga abrir
        await databaseService.saveDocument({
          tenant_id:      (user as any).tenant_id,
          studentId:      student.id,
          userId:         (user as any).id,
          doc_type:       t.id,
          title:          `${t.label} — ${student.name}`,
          content:        jsonStr,
          structuredData: { sections },
          status:         'DRAFT',
          generatedBy:    (user as any).name || 'Sistema',
          auditCode,
        });

        // Registra evento na linha do tempo
        if ((user as any)?.tenant_id) {
          TimelineService.add({
            tenantId:    (user as any).tenant_id,
            studentId:   student.id,
            eventType:   'documento',
            title:       `${t.label} gerado em lote`,
            description: `Documento gerado por ${(user as any).name ?? 'Sistema'} · Cód. ${auditCode}`,
            author:      (user as any).name,
          }).catch(() => {});
        }

        setBatchProgress(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'done' } : p));
      } catch (err: any) {
        setBatchProgress(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'error', msg: err?.message || 'Erro' } : p));
      }
    }
    setBatchRunning(false);
    // Recarrega documentos para refletir na aba Documentos
    await loadDbDocs();
    await onRefreshProtocols?.();
    // Fecha modal, navega para aba Documentos e exibe toast de confirmação
    setShowBatchModal(false);
    setActiveTab('documentos');
    setBatchToast('Documentos gerados com sucesso. Verifique na aba Documentos se o conteúdo está de acordo com a veracidade dos fatos.');
    setTimeout(() => setBatchToast(''), 8000);
  };

  const handleSaveHistory = async () => {
    setIsSavingHistory(true);
    try {
      const updated = { ...student, schoolHistory: historyText };
      await databaseService.saveStudent(updated);
      onUpdateStudent?.(updated);
      alert('Histórico salvo com sucesso!');
    } catch (e) {
      console.error(e);
      alert('Erro ao salvar histórico.');
    } finally {
      setIsSavingHistory(false);
    }
  };

  const handleAnalyzeDoc = async (doc: { name: string; url?: string; path?: string }, index: number) => {
    if (!confirm('Analisar este documento com IA? (Custo: 5 créditos)')) return;
    setAnalyzingDocId(index.toString());
    try {
      const effectiveUser: any = user ?? { id: 'local', tenant_id: student.tenant_id ?? 'default', plan: userPlan };
      const result = await AIService.analyzeDocument(doc.name, doc.url, student, effectiveUser);
      const updatedAnalyses = [result, ...analyses];
      setAnalyses(updatedAnalyses);
      const updatedStudent = { ...student, documentAnalyses: updatedAnalyses };
      await databaseService.saveStudent(updatedStudent);
      if (!DEMO_MODE && (user as any)?.tenant_id) {
        const tenantId = (user as any).tenant_id;
        const reportId = await MedicalReportService.save({
          tenantId,
          studentId: student.id,
          synthesis: result.synthesis,
          pedagogicalPoints: result.pedagogicalPoints,
          suggestions: result.suggestions,
          rawContent: doc.name,
        });
        await TimelineService.add({
          tenantId,
          studentId: student.id,
          eventType: 'laudo',
          title: `Laudo analisado: ${doc.name}`,
          description: result.synthesis?.slice(0, 120) ?? '',
          linkedId: reportId ?? undefined,
          linkedTable: 'medical_reports',
          icon: 'Brain',
          author: (user as any)?.name ?? 'Usuário',
        });
      }
      alert('Análise concluída e salva no histórico!');
    } catch (e: any) {
      alert('Erro na análise: ' + e.message);
    } finally {
      setAnalyzingDocId(null);
    }
  };

  const resolveDocUrl = async (doc: any): Promise<string | null> => {
    const raw = doc?.url;
    if (raw && /^https?:\/\//i.test(raw)) return raw;
    const path = doc?.path ?? raw;
    if (!path) return null;
    return await StorageService.getPublicUrl('laudos', path);
  };

  const persistDocs = async (nextDocs: any[]) => {
    const updated = { ...student, documents: nextDocs };
    await databaseService.saveStudent(updated);
    onUpdateStudent?.(updated);
  };

  const handleUploadDocClick = () => fileInputRef.current?.click();

  const handleUploadDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (userPlan === PlanTier.FREE) { alert('Recurso disponível a partir do plano PRO.'); return; }
    setIsUploadingDoc(true);
    try {
      // 1. Upload do arquivo para o Storage
      const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${student.id}/${Date.now()}_${cleanName}`;
      const uploadedPath = await StorageService.uploadFile(file, 'laudos', path);
      if (!uploadedPath) throw new Error('Falha ao enviar arquivo para o Storage. Verifique se o bucket "laudos" existe no Supabase.');

      const publicUrl = await StorageService.getPublicUrl('laudos', uploadedPath);

      // 2. Salva na tabela student_documents (persistência real no banco)
      //    NÃO usa saveStudent — a tabela students não tem coluna "documents"
      const tenantId = (user as any)?.tenant_id;
      if (!tenantId) throw new Error('Tenant não identificado. Faça logout e login novamente.');

      const docId = await StudentDocumentService.save({
        tenantId,
        studentId:    student.id,
        name:         file.name,
        documentType: docUploadType,
        fileUrl:      publicUrl ?? undefined,
        filePath:     uploadedPath,
        fileSize:     file.size,
        mimeType:     file.type,
        uploadedBy:   (user as any)?.name ?? 'Usuário',
      });

      if (!docId) throw new Error('Documento não foi salvo no banco. Verifique as permissões RLS da tabela student_documents.');

      // 3. Timeline
      if (!DEMO_MODE) {
        await TimelineService.add({
          tenantId, studentId: student.id, eventType: 'laudo',
          title: `Documento anexado: ${file.name}`, description: `Tipo: ${docUploadType}`,
          linkedId: docId, linkedTable: 'student_documents',
          icon: 'Paperclip', author: (user as any)?.name ?? 'Usuário',
        });
      }

      // 4. Atualiza estado local imediatamente (sem precisar recarregar a página)
      setDbDocs(prev => [{
        id: docId, name: file.name,
        date: new Date().toLocaleDateString('pt-BR'),
        type: docUploadType, url: publicUrl ?? undefined, path: uploadedPath,
      }, ...prev]);

      alert('Documento anexado com sucesso!');
    } catch (err: any) {
      alert('Erro ao anexar documento: ' + (err?.message ?? err));
    } finally {
      setIsUploadingDoc(false);
    }
  };

  const handleDeleteFicha = (fichaId: string) => {
    if (!confirm('Excluir esta ficha?')) return;
    const updated = fichas.filter(f => f.id !== fichaId);
    setFichas(updated);
    onUpdateStudent?.({ ...student, fichasComplementares: updated });
  };

  const handleDeleteDoc = async (doc: any) => {
    if (!confirm('Excluir este documento?')) return;
    try {
      // Remove arquivo do Storage
      if (doc?.path) await StorageService.removeFile('laudos', doc.path);
      // Remove da tabela student_documents
      if (doc?.id) await StudentDocumentService.delete(doc.id);
      // Atualiza estado local
      setDbDocs(prev => prev.filter(d => d.id !== doc.id));
    } catch (err: any) {
      alert('Erro ao excluir: ' + (err?.message ?? ''));
    }
  };

  const handleViewDoc = async (doc: any) => {
    const url = await resolveDocUrl(doc);
    if (!url) { alert('Não foi possível abrir este arquivo.'); return; }
    setDocPreview({ name: doc?.name ?? 'Documento', url });
  };

  const handleDownloadDoc = async (doc: any) => {
    const url = await resolveDocUrl(doc);
    if (!url) { alert('Não foi possível baixar este arquivo.'); return; }
    const a = document.createElement('a');
    a.href = url; a.download = doc?.name ?? 'documento'; a.target = '_blank'; a.rel = 'noreferrer';
    document.body.appendChild(a); a.click(); a.remove();
  };

  const getStatusBadge = (status: string) => {
    if (status === 'FINAL') return (
      <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-[10px] font-bold border border-green-200">
        <CheckCircle size={9}/> Concluído
      </span>
    );
    return (
      <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-[10px] font-bold border border-gray-200">
        <Clock size={9}/> Rascunho
      </span>
    );
  };

  // KPIs
  const totalServices = serviceRecords.length;
  const presentServices = serviceRecords.filter(r => r.attendance === 'Presente').length;
  const presenceRate = totalServices > 0 ? Math.round((presentServices / totalServices) * 100) : 0;

  // Evoluções: prefere dados do banco, cai para legacy
  const sortedEvolutions = effectiveEvolutions as any[];
  const latestEvolution  = sortedEvolutions[0] ?? null;

  // Controla qual avaliação está selecionada no histórico (0 = mais recente)
  const [selectedEvoIndex, setSelectedEvoIndex] = useState(0);
  const selectedEvolution = sortedEvolutions[selectedEvoIndex] ?? latestEvolution;

  // Mantém índice válido quando lista muda
  const safeEvoIndex = Math.min(selectedEvoIndex, Math.max(0, sortedEvolutions.length - 1));

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'ficha',      label: 'Ficha do Aluno',      icon: <User size={13}/> },
    { id: 'evolucao',   label: 'Evolução',             icon: <TrendingUp size={13}/> },
    { id: 'agenda',     label: 'Agenda',               icon: <Calendar size={13}/> },
    { id: 'documentos', label: 'Documentos',           icon: <FileText size={13}/> },
    { id: 'atividades', label: 'Atividades Geradas',   icon: <Zap size={13}/> },
    { id: 'timeline',   label: 'Linha do Tempo',       icon: <Activity size={13}/> },
  ];

  return (
    <div className="max-w-6xl mx-auto pb-20 space-y-5">
      {/* ── Toast: geração em lote ── */}
      {batchToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] bg-green-700 text-white text-sm font-medium px-5 py-3 rounded-2xl shadow-xl max-w-md text-center flex items-start gap-3">
          <CheckCircle size={18} className="shrink-0 mt-0.5 text-green-200" />
          <span>{batchToast}</span>
        </div>
      )}
      {/* ── Header ── */}
      <div className="flex items-center justify-between print:hidden">
        <button onClick={onBack} className="flex items-center gap-2 text-gray-500 hover:text-brand-600 transition text-sm">
          <ArrowLeft size={18}/> Voltar para Lista
        </button>
        <div className="flex gap-2 flex-wrap">
          <button onClick={onEdit} className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-50 transition shadow-sm">
            <Edit size={15}/> Editar Dados
          </button>
          <button
            onClick={() => { setBatchSelected(['ESTUDO_DE_CASO', 'PAEE', 'PEI']); setBatchProgress([]); setBatchRunning(false); setShowBatchModal(true); }}
            className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-50 transition shadow-sm"
          >
            <Sparkles size={15}/> Gerar em Lote
          </button>
          <button onClick={handleDownloadFiche} className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-brand-700 transition shadow-sm flex items-center gap-2">
            <Printer size={15}/> Baixar Ficha PDF
          </button>
        </div>
      </div>

      {/* ── Hero Card ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Colored banner */}
        <div className="h-2" style={{ background: 'linear-gradient(90deg, #1F4E5F, #2E3A59)' }}/>

        <div className="p-6 flex flex-col md:flex-row gap-6 items-start">
          {/* Avatar */}
          <div className="w-20 h-20 rounded-2xl border-2 border-gray-100 overflow-hidden shrink-0 shadow-sm bg-gray-50">
            {student.photoUrl ? (
              <img src={student.photoUrl} alt={student.name} className="w-full h-full object-cover"/>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-3xl font-bold" style={{ background: '#EFF9FF', color: '#1F4E5F' }}>
                {student.name.charAt(0)}
              </div>
            )}
          </div>

          {/* Name + badges */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap gap-1.5 mb-2">
              <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${student.tipo_aluno === 'em_triagem' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800'}`}>
                {student.tipo_aluno === 'em_triagem' ? '🔍 Em Triagem' : '📋 Com Laudo'}
              </span>
              {student.diagnosis.map(d => (
                <span key={d} className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-700">{d}</span>
              ))}
              {student.supportLevel && (
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-brand-100 text-brand-700">{student.supportLevel}</span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">{student.name}</h1>
            <div className="flex flex-wrap gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1"><Calendar size={12}/> {calculateAge(student.birthDate)} anos · {new Date(student.birthDate + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
              <span className="flex items-center gap-1"><User size={12}/> Resp: {student.guardianName}</span>
              {student.schoolName && <span className="flex items-center gap-1"><BookOpen size={12}/> {student.schoolName} · {student.grade}</span>}
            </div>
          </div>

          {/* KPIs */}
          <div className="flex gap-3 shrink-0">
            {[
              { label: 'Atendimentos', value: totalServices, color: '#1F4E5F' },
              { label: 'Presença', value: `${presenceRate}%`, color: '#16a34a' },
              { label: 'Documentos', value: studentProtocols.length, color: '#7c3aed' },
            ].map(k => (
              <div key={k.label} className="bg-gray-50 rounded-xl px-4 py-3 text-center border border-gray-100">
                <div className="text-xl font-bold" style={{ color: k.color }}>{k.value}</div>
                <div className="text-[10px] text-gray-500 font-semibold mt-0.5">{k.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-t border-gray-100 print:hidden overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-5 py-3 text-xs font-bold whitespace-nowrap border-b-2 transition-colors ${
                activeTab === t.id
                  ? 'border-brand-600 text-brand-700 bg-brand-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {t.icon}{t.label}
              {t.id === 'documentos' && dbDocs.length + studentProtocols.length + (dbObsForms.length || fichas.length) > 0 && (
                <span className="ml-1 text-[9px] bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded-full font-bold">
                  {dbDocs.length + studentProtocols.length + (dbObsForms.length || fichas.length)}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 1 — FICHA DO ALUNO
          Seção 1: Identificação · Seção 2: Classificação · Seção 3: Perfil Pedagógico
         ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'ficha' && (
        <div className="space-y-5">
          <div className="grid md:grid-cols-2 gap-5">

            {/* ─ Seção 1: Identificação ─ */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
              <SectionHeader
                icon={<User size={16} style={{ color: '#1F4E5F' }}/>}
                title="1. Identificação do Aluno"
                subtitle="Dados pessoais e escolares"
              />
              <div className="space-y-0.5">
                <InfoRow label="Nome completo"   value={student.name} />
                <InfoRow label="Data de nascimento" value={new Date(student.birthDate + 'T12:00:00').toLocaleDateString('pt-BR')} />
                <InfoRow label="Idade"            value={`${calculateAge(student.birthDate)} anos`} />
                <InfoRow label="Gênero"           value={student.gender === 'M' ? 'Masculino' : student.gender === 'F' ? 'Feminino' : student.gender} />
                <InfoRow label="Responsável"      value={student.guardianName} />
                <InfoRow label="Contato"          value={student.guardianPhone} />
                <InfoRow label="E-mail"           value={student.guardianEmail} />
                <div className="mt-3 pt-2 border-t border-gray-50">
                  <p className="text-[10px] font-bold uppercase text-gray-400 tracking-wider mb-2">Escola & Equipe</p>
                  <InfoRow label="Escola"         value={student.schoolName || (student as any).school_name} />
                  <InfoRow label="Série / Ano"    value={student.grade} />
                  <InfoRow label="Turno"          value={student.shift} />
                  <InfoRow label="Prof. Regente"  value={student.regentTeacher} />
                  <InfoRow label="Prof. AEE"      value={student.aeeTeacher} />
                  <InfoRow label="Coordenação"    value={student.coordinator} />
                </div>
              </div>
            </div>

            {/* ─ Seção 2: Classificação & Contexto ─ */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
              <SectionHeader
                icon={<ShieldCheck size={16} style={{ color: '#1F4E5F' }}/>}
                title="2. Classificação e Contexto"
                subtitle="Diagnóstico, suporte e contexto escolar"
              />
              <div className="space-y-3">
                {/* Status */}
                <div>
                  <p className="text-[10px] font-bold uppercase text-gray-400 tracking-wider mb-1.5">Status</p>
                  <span className={`inline-flex text-xs font-bold px-3 py-1 rounded-full ${student.tipo_aluno === 'em_triagem' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800'}`}>
                    {student.tipo_aluno === 'em_triagem' ? '🔍 Em processo de triagem / avaliação' : '📋 Com laudo diagnóstico confirmado'}
                  </span>
                </div>

                {/* Diagnóstico */}
                {student.diagnosis?.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase text-gray-400 tracking-wider mb-1.5">Diagnóstico(s)</p>
                    <div className="flex flex-wrap gap-1.5">
                      {student.diagnosis.map((d, i) => <Tag_ key={i} label={d} color="purple"/>)}
                    </div>
                  </div>
                )}

                <InfoRow label="CID" value={(Array.isArray(student.cid) ? student.cid : [student.cid]).filter(Boolean).join(', ')} />
                <InfoRow label="Nível de Suporte (DSM-5)" value={student.supportLevel} />

                {/* Medicação */}
                {student.medication && (
                  <div>
                    <p className="text-[10px] font-bold uppercase text-gray-400 tracking-wider mb-1">Medicação</p>
                    <p className="text-xs text-gray-700 bg-gray-50 rounded-lg p-2 border border-gray-100">{student.medication}</p>
                  </div>
                )}

                {/* Profissionais externos */}
                {student.professionals?.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase text-gray-400 tracking-wider mb-1.5">Profissionais Externos</p>
                    <div className="flex flex-wrap gap-1.5">
                      {student.professionals.map((p, i) => <Tag_ key={i} label={p} color="blue"/>)}
                    </div>
                  </div>
                )}

                {/* Contexto externo */}
                {student.isExternalStudent && (
                  <div className="bg-yellow-50 rounded-lg p-3 border border-yellow-100 text-xs space-y-1">
                    <p className="font-bold text-yellow-800 text-[10px] uppercase">Atendimento Externo</p>
                    <InfoRow label="Escola de origem" value={student.externalSchoolName} />
                    <InfoRow label="Cidade"           value={student.externalSchoolCity} />
                    <InfoRow label="Profissional"     value={student.externalProfessional} />
                    <InfoRow label="Encaminhado por"  value={student.externalReferralSource} />
                  </div>
                )}

                {/* Contexto familiar */}
                {student.familyContext && (
                  <div>
                    <p className="text-[10px] font-bold uppercase text-gray-400 tracking-wider mb-1">Contexto Familiar</p>
                    <p className="text-xs text-gray-700 bg-gray-50 rounded-lg p-2 border border-gray-100">{student.familyContext}</p>
                  </div>
                )}

                {/* Endereço */}
                {(student.street || student.zipcode || student.city) && (
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-100 text-xs space-y-1">
                    <p className="font-bold text-gray-600 text-[10px] uppercase tracking-wider mb-1.5">Endereço</p>
                    {student.street && (
                      <InfoRow
                        label="Logradouro"
                        value={[student.street, student.streetNumber, student.complement].filter(Boolean).join(', ')}
                      />
                    )}
                    {student.neighborhood && <InfoRow label="Bairro"  value={student.neighborhood} />}
                    {student.city         && <InfoRow label="Cidade"  value={[student.city, student.state].filter(Boolean).join(' — ')} />}
                    {student.zipcode      && <InfoRow label="CEP"     value={student.zipcode} />}
                  </div>
                )}

                {/* Observações */}
                {student.observations && (
                  <div>
                    <p className="text-[10px] font-bold uppercase text-gray-400 tracking-wider mb-1">Observações Gerais</p>
                    <p className="text-xs text-gray-700 bg-gray-50 rounded-lg p-2 border border-gray-100 italic">{student.observations}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ─ Seção 3: Perfil Pedagógico e Funcional ─ */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
            <SectionHeader
              icon={<Brain size={16} style={{ color: '#1F4E5F' }}/>}
              title="3. Perfil Pedagógico e Funcional"
              subtitle="Habilidades, dificuldades, estratégias e comunicação"
            />
            <div className="grid md:grid-cols-2 gap-6">

              {/* Habilidades */}
              <div>
                <p className="text-xs font-bold text-green-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <CheckCircle size={12}/> Habilidades / Potencialidades
                </p>
                {student.abilities?.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {student.abilities.map((ab, i) => <Tag_ key={i} label={ab} color="green"/>)}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">Nenhuma habilidade registrada.</p>
                )}
              </div>

              {/* Dificuldades */}
              <div>
                <p className="text-xs font-bold text-orange-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <AlertCircle size={12}/> Dificuldades / Barreiras
                </p>
                {student.difficulties?.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {student.difficulties.map((d, i) => <Tag_ key={i} label={d} color="orange"/>)}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">Nenhuma dificuldade registrada.</p>
                )}
              </div>

              {/* Estratégias */}
              {student.strategies?.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Tag size={12}/> Estratégias Pedagógicas
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {student.strategies.map((s, i) => <Tag_ key={i} label={s} color="blue"/>)}
                  </div>
                </div>
              )}

              {/* Comunicação */}
              {student.communication?.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-purple-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Users size={12}/> Formas de Comunicação
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {student.communication.map((c, i) => <Tag_ key={i} label={c} color="purple"/>)}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Escola (histórico escolar) — leitura rápida */}
          {student.schoolHistory && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
              <SectionHeader
                icon={<BookOpen size={16} style={{ color: '#1F4E5F' }}/>}
                title="Histórico Escolar"
                subtitle="Resumo do percurso educacional"
              />
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{student.schoolHistory}</p>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 2 — EVOLUÇÃO
          Gráficos REAIS de student.evolutions[] + editor de histórico
         ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'evolucao' && (
        <div className="space-y-5">
          {/* Origem dos dados */}
          {dbEvolutions.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-50 border border-green-100 text-xs text-green-700 font-semibold">
              <CheckCircle size={13} className="text-green-500"/>
              {dbEvolutions.length} avaliação{dbEvolutions.length !== 1 ? 'ões' : ''} carregada{dbEvolutions.length !== 1 ? 's' : ''} com sucesso
            </div>
          )}
          {/* Charts */}
          {sortedEvolutions.length > 0 && selectedEvolution ? (
            <>
              {/* Selected evaluation header */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
                <div className="flex items-start justify-between mb-4">
                  <SectionHeader
                    icon={<BarChart2 size={16} style={{ color: '#7c3aed' }}/>}
                    title="Gráficos Evolutivos"
                    subtitle={`Avaliação de ${new Date(selectedEvolution.date).toLocaleDateString('pt-BR')} · por ${selectedEvolution.author || 'Profissional'}`}
                  />
                  {safeEvoIndex > 0 && (
                    <span className="text-[10px] bg-amber-100 text-amber-700 font-bold px-2 py-1 rounded-full border border-amber-200 shrink-0">
                      Registro anterior
                    </span>
                  )}
                </div>

                {/* Radar + Bars side by side */}
                <div className="grid md:grid-cols-2 gap-8 items-start">
                  <div className="flex flex-col items-center">
                    <p className="text-xs font-bold text-gray-500 uppercase mb-3">Perfil Radar</p>
                    <RadarChart scores={selectedEvolution.scores} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase mb-3">Por Dimensão</p>
                    <EvoBarChart scores={selectedEvolution.scores} labels={CRITERIA.map(c => c.name)} />
                    <div className="mt-4 space-y-1">
                      {CRITERIA.map((c, i) => {
                        const score = selectedEvolution.scores[i] ?? 0;
                        const color = score >= 4 ? '#16a34a' : score >= 3 ? '#7c3aed' : score >= 2 ? '#d97706' : '#dc2626';
                        return (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <span className="text-gray-600">{c.name}</span>
                            <span className="font-bold" style={{ color }}>{score}/5</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {selectedEvolution.observation && (
                  <div className="mt-5 bg-purple-50 rounded-lg p-3 border border-purple-100">
                    <p className="text-[10px] font-bold uppercase text-purple-600 mb-1">Observação da avaliação</p>
                    <p className="text-sm text-gray-700 italic">{selectedEvolution.observation}</p>
                  </div>
                )}
              </div>

              {/* Comparação de Evolução — última vs anterior */}
              {sortedEvolutions.length >= 2 && safeEvoIndex === 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
                  <SectionHeader
                    icon={<TrendingUp size={16} style={{ color: '#16a34a' }}/>}
                    title="Comparação de Evolução"
                    subtitle="Última avaliação vs. avaliação anterior"
                  />
                  <div className="space-y-2">
                    {CRITERIA.map((c, i) => {
                      const curr = sortedEvolutions[0].scores[i] ?? 0;
                      const prev = sortedEvolutions[1].scores[i] ?? 0;
                      const delta = curr - prev;
                      const deltaColor = delta > 0 ? '#16a34a' : delta < 0 ? '#dc2626' : '#6b7280';
                      const deltaIcon = delta > 0 ? '▲' : delta < 0 ? '▼' : '—';
                      const barColor = curr >= 4 ? '#16a34a' : curr >= 3 ? '#7c3aed' : curr >= 2 ? '#d97706' : '#dc2626';
                      return (
                        <div key={i} className="flex items-center gap-3 py-1.5 border-b border-gray-50 last:border-0">
                          <span className="text-xs text-gray-600 w-40 shrink-0">{c.name}</span>
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${(curr / 5) * 100}%`, background: barColor }}/>
                          </div>
                          <span className="text-xs font-bold text-gray-700 w-8 text-right">{curr}/5</span>
                          <span className="text-xs font-bold w-8 text-right" style={{ color: deltaColor }}>
                            {deltaIcon}{delta !== 0 ? Math.abs(delta) : ''}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-3">
                    Comparado com: {new Date(sortedEvolutions[1].date).toLocaleDateString('pt-BR')} · por {sortedEvolutions[1].author || 'Profissional'}
                  </p>
                </div>
              )}

              {/* Histórico de Avaliações — todos os registros, clicáveis */}
              {sortedEvolutions.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
                  <SectionHeader
                    icon={<TrendingUp size={16} style={{ color: '#1F4E5F' }}/>}
                    title="Histórico de Avaliações"
                    subtitle={`${sortedEvolutions.length} registro${sortedEvolutions.length !== 1 ? 's' : ''} — clique para visualizar`}
                  />
                  <div className="space-y-2">
                    {sortedEvolutions.map((evo, i) => {
                      const avg = (evo.scores.reduce((a: number, b: number) => a + b, 0) / evo.scores.length).toFixed(1);
                      const isSelected = i === safeEvoIndex;
                      return (
                        <button
                          key={evo.id ?? i}
                          onClick={() => setSelectedEvoIndex(i)}
                          className={`w-full flex items-center gap-4 p-3 rounded-xl border transition text-left ${
                            isSelected
                              ? 'bg-purple-50 border-purple-200 shadow-sm'
                              : 'bg-gray-50 border-gray-100 hover:bg-gray-100'
                          }`}
                        >
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? 'bg-purple-600' : 'bg-purple-100'}`}>
                            <TrendingUp size={16} className={isSelected ? 'text-white' : 'text-purple-600'}/>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-bold text-gray-800">
                                {new Date(evo.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                              </p>
                              {i === 0 && <span className="text-[9px] bg-green-100 text-green-700 font-bold px-1.5 py-0.5 rounded-full">Mais recente</span>}
                            </div>
                            <p className="text-xs text-gray-500">por {evo.author} · Média: {avg}/5</p>
                          </div>
                          {evo.observation && (
                            <p className="text-xs text-gray-400 italic max-w-[180px] truncate hidden md:block">{evo.observation}</p>
                          )}
                          {isSelected && <span className="text-[10px] text-purple-600 font-bold shrink-0">Exibindo ▶</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Empty state */
            <div className="bg-white rounded-2xl shadow-sm border border-dashed border-gray-200 p-12 text-center">
              <BarChart2 size={40} className="mx-auto mb-4 text-gray-200"/>
              <p className="text-gray-500 font-semibold mb-1">Nenhum registro evolutivo encontrado</p>
              <p className="text-xs text-gray-400 max-w-sm mx-auto">
                Use <strong>Perfil Cognitivo</strong> no menu lateral (ícone 🧠) para registrar avaliações periódicas.
                Os gráficos aqui exibirão somente dados reais inseridos pelo profissional — nenhum valor inventado.
              </p>
            </div>
          )}

          {/* Histórico escolar editável */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <SectionHeader
                icon={<Clock size={16} style={{ color: '#1F4E5F' }}/>}
                title="Histórico Evolutivo e Anotações"
                subtitle="Registro livre de observações e progresso"
              />
              <button
                onClick={handleSaveHistory}
                disabled={isSavingHistory}
                className="text-xs bg-brand-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-brand-700 flex items-center gap-1 disabled:opacity-50 shrink-0"
              >
                {isSavingHistory ? 'Salvando...' : <><Save size={13}/> Salvar</>}
              </button>
            </div>
            <SmartTextarea
              value={historyText}
              onChange={setHistoryText}
              placeholder="Registre aqui o histórico evolutivo do aluno, observações diárias e anotações importantes..."
              className="min-h-[200px]"
            />
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 3 — AGENDA
          Atendimentos registrados do aluno
         ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'agenda' && (() => {
        const studentAppointments = appointments
          .filter(a => a.studentId === student.id)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return (
          <div className="space-y-5">
            {/* ── Agendamentos (AppointmentsView) ── */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
              <SectionHeader
                icon={<Calendar size={16} style={{ color: '#1F4E5F' }}/>}
                title="6. Agendamentos"
                subtitle={`${studentAppointments.length} agendamento(s) para este aluno`}
              />
              {studentAppointments.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center">
                  <Calendar size={28} className="mx-auto mb-2 text-gray-200"/>
                  <p className="text-gray-400 text-sm">Nenhum agendamento vinculado.</p>
                  <p className="text-xs text-gray-300 mt-1">Crie um agendamento na Agenda e vincule este aluno.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead>
                      <tr className="text-[10px] text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                        <th className="px-4 py-3 font-bold">Data</th>
                        <th className="px-4 py-3 font-bold">Hora</th>
                        <th className="px-4 py-3 font-bold">Título</th>
                        <th className="px-4 py-3 font-bold">Tipo</th>
                        <th className="px-4 py-3 font-bold">Profissional</th>
                        <th className="px-4 py-3 font-bold">Local</th>
                        <th className="px-4 py-3 font-bold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {studentAppointments.map(a => (
                        <tr key={a.id} className="hover:bg-gray-50 transition">
                          <td className="px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">
                            {new Date(a.date + 'T00:00:00').toLocaleDateString('pt-BR')}
                          </td>
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{a.time ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-800 font-medium">{a.title}</td>
                          <td className="px-4 py-3 text-gray-600">{a.type}</td>
                          <td className="px-4 py-3 text-gray-500">{a.professional}</td>
                          <td className="px-4 py-3 text-gray-400 text-xs">{a.location ?? '—'}</td>
                          <td className="px-4 py-3">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              a.status === 'realizado'  ? 'bg-green-100 text-green-700' :
                              a.status === 'cancelado'  ? 'bg-red-100 text-red-600' :
                              a.status === 'falta'      ? 'bg-orange-100 text-orange-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>{a.status ?? 'agendado'}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Controle de Atendimento (ServiceControlView) ── */}
            {serviceRecords.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
                <SectionHeader
                  icon={<CheckCircle size={16} style={{ color: '#1F4E5F' }}/>}
                  title="Controle de Atendimentos"
                  subtitle={`${totalServices} atendimentos · ${presenceRate}% de presença`}
                />
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead>
                      <tr className="text-[10px] text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                        <th className="px-4 py-3 font-bold">Data</th>
                        <th className="px-4 py-3 font-bold">Hora</th>
                        <th className="px-4 py-3 font-bold">Tipo</th>
                        <th className="px-4 py-3 font-bold">Profissional</th>
                        <th className="px-4 py-3 font-bold">Presença</th>
                        <th className="px-4 py-3 font-bold">Observações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {serviceRecords.map(r => (
                        <tr key={r.id} className="hover:bg-gray-50 transition">
                          <td className="px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">
                            {new Date(r.date).toLocaleDateString('pt-BR')}
                          </td>
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{r.time ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-700">{r.type}</td>
                          <td className="px-4 py-3 text-gray-600">{r.professional}</td>
                          <td className="px-4 py-3">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              r.attendance === 'Presente' ? 'bg-green-100 text-green-700' :
                              r.attendance === 'Falta' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'
                            }`}>{r.attendance ?? '—'}</span>
                          </td>
                          <td className="px-4 py-3 text-gray-400 text-xs max-w-xs truncate" title={r.observations}>{r.observations ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 4 — DOCUMENTOS
          Laudos/upload · Fichas Complementares · Protocolos Gerados · Auditoria
         ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'documentos' && (
        <div className="space-y-5">

          {/* ─ Ações Complementares (Sprint 5B) ─ */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-1">
              <Send size={16} style={{ color: '#1F4E5F' }} />
              <span className="font-bold text-gray-800 text-sm">Documentos Complementares</span>
            </div>
            <p className="text-xs text-gray-400 mb-4">
              Gere documentos prontos para impressão e assinatura a partir dos dados do aluno.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {([
                { type: 'encaminhamento_redes' as QuickDocType,
                  label: 'Encaminhamento', desc: 'Para serviços de saúde ou assistência',
                  icon: <Send size={16}/>, color: '#1F4E5F', bg: '#EFF9FF', border: '#BAE6FD' },
                { type: 'convite_reuniao' as QuickDocType,
                  label: 'Convite para Reunião', desc: 'Convocar família para reunião pedagógica',
                  icon: <FileText size={16}/>, color: '#374151', bg: '#F3F4F6', border: '#E5E7EB' },
                { type: 'termo_desligamento' as QuickDocType,
                  label: 'Termo de Desligamento', desc: 'Encerramento formal do AEE',
                  icon: <LogOut size={16}/>, color: '#9A3412', bg: '#FFF7ED', border: '#FDBA74' },
              ]).map(item => (
                <button
                  key={item.type}
                  onClick={() => setQuickDocType(item.type)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                    gap: 6, padding: '14px 14px', borderRadius: 12, cursor: 'pointer',
                    border: `1.5px solid ${item.border}`,
                    background: item.bg, textAlign: 'left',
                    transition: 'box-shadow 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 14px rgba(31,78,95,0.12)')}
                  onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
                >
                  <div style={{ color: item.color }}>{item.icon}</div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: item.color }}>{item.label}</div>
                    <div style={{ fontSize: 10, color: '#667085', marginTop: 2 }}>{item.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* ─ Laudos & Relatórios ─ */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
            <SectionHeader
              icon={<Paperclip size={16} style={{ color: '#1F4E5F' }}/>}
              title="7. Laudos e Relatórios Externos"
              subtitle="Anexar e analisar documentos clínicos com IA"
            />

            {/* Upload */}
            <div className="flex flex-wrap items-center gap-3 mb-5">
              <select
                value={docUploadType}
                onChange={(e) => setDocUploadType(e.target.value as any)}
                className="bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-semibold shadow-sm"
              >
                <option value="Laudo">Laudo</option>
                <option value="Relatorio">Relatório</option>
                <option value="Outro">Outro</option>
              </select>
              <button
                onClick={handleUploadDocClick}
                disabled={isUploadingDoc}
                className="bg-brand-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-brand-700 transition shadow-sm flex items-center gap-2 disabled:opacity-50"
              >
                <FilePlus size={15}/> {isUploadingDoc ? 'Enviando...' : 'Anexar arquivo'}
              </button>
              <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={handleUploadDoc}/>
              {userPlan === PlanTier.FREE && (
                <span className="text-xs text-orange-700 font-bold bg-orange-50 px-2 py-1 rounded-lg border border-orange-100">
                  Disponível a partir do plano PRO
                </span>
              )}
            </div>

            {/* Document list */}
            {loadingDocs ? (
              <div className="p-6 text-center text-sm text-gray-400">Carregando documentos…</div>
            ) : dbDocs.length === 0 ? (
              <div className="p-8 text-center rounded-xl border border-dashed border-gray-200">
                <Paperclip size={24} className="mx-auto mb-2 text-gray-300"/>
                <p className="text-sm text-gray-400">Nenhum documento anexado.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {dbDocs.map((doc, idx) => (
                  <div key={idx} className="bg-gray-50 rounded-xl border border-gray-100 p-3">
                    <div className="flex justify-between items-center flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0">
                          <FileText size={15} className="text-gray-400"/>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-700">{doc.name}</p>
                          <p className="text-xs text-gray-400">{doc.date} · <span className="font-semibold">{doc.type}</span></p>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => handleViewDoc(doc)} className="text-xs bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg font-bold hover:bg-gray-50 flex items-center gap-1"><Eye size={12}/> Ver</button>
                        <button onClick={() => handleDownloadDoc(doc)} className="text-xs bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg font-bold hover:bg-gray-50 flex items-center gap-1"><Download size={12}/> Baixar</button>
                        <button
                          onClick={() => handleAnalyzeDoc(doc, idx)}
                          disabled={!!analyzingDocId}
                          className="text-xs bg-purple-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-purple-700 flex items-center gap-1 disabled:opacity-50"
                        >
                          {analyzingDocId === idx.toString()
    ? 'Analisando...'
    : <><FileSearch size={12}/><Sparkles size={11}/> Analisar com IA <span style={{ fontWeight: 700, opacity: 0.8 }}>· 2 créd.</span></>}
                        </button>
                        <button onClick={() => handleDeleteDoc(doc)} className="text-xs bg-white border border-red-100 text-red-400 px-2 py-1.5 rounded-lg font-bold hover:bg-red-50 flex items-center gap-1"><Trash2 size={12}/></button>
                      </div>
                    </div>
                    {/* IA analysis result — legado (student.documentAnalyses) */}
                    {analyses.filter(a => a.documentName === doc.name).map(analysis => (
                      <div key={analysis.id} className="mt-3 border-t border-gray-200 pt-3">
                        <div className="bg-white p-3 rounded-lg border border-purple-100">
                          <p className="text-xs font-bold text-purple-800 mb-1">Análise IA:</p>
                          <p className="text-xs text-gray-600 italic mb-2">"{analysis.synthesis}"</p>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <p className="text-[10px] font-bold uppercase text-gray-500">Pontos Pedagógicos</p>
                              <ul className="text-[10px] list-disc pl-3 text-gray-600">
                                {analysis.pedagogicalPoints.slice(0, 3).map((p, i) => <li key={i}>{p}</li>)}
                              </ul>
                            </div>
                            <div>
                              <p className="text-[10px] font-bold uppercase text-gray-500">Sugestões</p>
                              <ul className="text-[10px] list-disc pl-3 text-gray-600">
                                {analysis.suggestions.slice(0, 3).map((s, i) => <li key={i}>{s}</li>)}
                              </ul>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {/* IA analysis result — banco (medical_reports) */}
                    {dbMedicalReports.filter(r => r.raw_content === doc.name).map((r: any) => (
                      <div key={r.id} className="mt-3 border-t border-gray-200 pt-3">
                        <div className="bg-white p-3 rounded-lg border border-purple-100">
                          <p className="text-xs font-bold text-purple-800 mb-1">Análise IA (salva):</p>
                          {r.synthesis && <p className="text-xs text-gray-600 italic mb-2">"{r.synthesis}"</p>}
                          <div className="grid grid-cols-2 gap-2">
                            {Array.isArray(r.pedagogical_points) && r.pedagogical_points.length > 0 && (
                              <div>
                                <p className="text-[10px] font-bold uppercase text-gray-500">Pontos Pedagógicos</p>
                                <ul className="text-[10px] list-disc pl-3 text-gray-600">
                                  {r.pedagogical_points.slice(0, 3).map((p: string, i: number) => <li key={i}>{p}</li>)}
                                </ul>
                              </div>
                            )}
                            {Array.isArray(r.suggestions) && r.suggestions.length > 0 && (
                              <div>
                                <p className="text-[10px] font-bold uppercase text-gray-500">Sugestões</p>
                                <ul className="text-[10px] list-disc pl-3 text-gray-600">
                                  {r.suggestions.slice(0, 3).map((s: string, i: number) => <li key={i}>{s}</li>)}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ─ Fichas Complementares ─ */}
          {(() => {
            // Prioridade: dados reais do banco (observation_forms) → legado (student.fichasComplementares)
            const hasBankFichas = dbObsForms.length > 0;
            const totalFichas   = hasBankFichas ? dbObsForms.length : fichas.length;
            return (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
                <SectionHeader
                  icon={<ClipboardCheck size={16} style={{ color: '#1F4E5F' }}/>}
                  title="Fichas Complementares Vinculadas"
                  subtitle={`${totalFichas} ficha(s) registrada(s)${hasBankFichas ? ' · dados do banco' : ''}`}
                />
                <button
                  onClick={() => onNavigateTo?.('fichas')}
                  className="mb-4 flex items-center gap-2 text-sm font-bold text-brand-700 bg-brand-50 border border-brand-100 px-4 py-2 rounded-lg hover:bg-brand-100 transition"
                >
                  <FilePlus size={14}/> Nova Ficha Complementar
                </button>

                {totalFichas === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center">
                    <ClipboardCheck size={28} className="mx-auto mb-2 text-gray-200"/>
                    <p className="text-gray-400 text-sm">Nenhuma ficha complementar registrada.</p>
                    <p className="text-xs text-gray-300 mt-0.5">Clique em "Nova Ficha Complementar" acima para criar.</p>
                  </div>
                ) : hasBankFichas ? (
                  /* ── Fichas do banco (observation_forms) ── */
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-[10px] text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                        <tr>
                          <th className="px-4 py-3 text-left font-bold">Tipo / Título</th>
                          <th className="px-4 py-3 text-left font-bold">Data</th>
                          <th className="px-4 py-3 text-left font-bold">Por</th>
                          <th className="px-4 py-3 text-left font-bold">Status</th>
                          <th className="px-4 py-3 text-left font-bold">Código Auditoria</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {dbObsForms.map((f: any) => (
                          <tr key={f.id} className="hover:bg-gray-50 transition">
                            <td className="px-4 py-3">
                              <p className="font-semibold text-gray-800 text-sm">{f.title}</p>
                              <p className="text-[10px] text-gray-400 mt-0.5">{f.form_type}</p>
                            </td>
                            <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                              {new Date(f.created_at).toLocaleDateString('pt-BR')}
                            </td>
                            <td className="px-4 py-3 text-gray-500 text-xs">{f.created_by ?? '—'}</td>
                            <td className="px-4 py-3">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${f.status === 'finalizado' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                {f.status === 'finalizado' ? '✅ Finalizado' : '📝 Rascunho'}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-mono text-[10px] text-gray-400">{f.audit_code ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {/* Audit trail */}
                    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 mt-3">
                      <p className="text-[10px] font-bold text-gray-500 uppercase mb-2 flex items-center gap-1.5">
                        <ShieldCheck size={11} className="text-green-500"/> Log de Auditoria
                      </p>
                      <div className="space-y-1">
                        {dbObsForms.map((f: any) => (
                          <div key={f.id} className="text-[10px] text-gray-500 font-mono flex flex-wrap gap-2">
                            <span>{new Date(f.created_at).toLocaleString('pt-BR')}</span>
                            <span className="text-gray-400">|</span>
                            <span>{f.form_type}</span>
                            <span className="text-gray-400">|</span>
                            <span>{f.audit_code ?? 'sem código'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ── Fichas legadas (student.fichasComplementares) ── */
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="text-[10px] text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                          <tr>
                            <th className="px-4 py-3 text-left font-bold">Tipo</th>
                            <th className="px-4 py-3 text-left font-bold">Data</th>
                            <th className="px-4 py-3 text-left font-bold">Por</th>
                            <th className="px-4 py-3 text-left font-bold">Status</th>
                            <th className="px-4 py-3 text-left font-bold">Código</th>
                            <th className="px-4 py-3 font-bold"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {fichas.map(f => (
                            <tr key={f.id} className="hover:bg-gray-50 transition">
                              <td className="px-4 py-3 font-semibold text-gray-800">{f.titulo}</td>
                              <td className="px-4 py-3 text-gray-500 text-xs">{new Date(f.createdAt).toLocaleDateString('pt-BR')}</td>
                              <td className="px-4 py-3 text-gray-500 text-xs">{f.createdBy}</td>
                              <td className="px-4 py-3">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${f.status === 'finalizado' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                  {f.status === 'finalizado' ? '✅ Finalizado' : '📝 Rascunho'}
                                </span>
                              </td>
                              <td className="px-4 py-3 font-mono text-[10px] text-gray-400">{f.auditCode}</td>
                              <td className="px-4 py-3">
                                <button
                                  onClick={() => handleDeleteFicha(f.id)}
                                  className="text-red-400 hover:text-red-600 text-xs border border-red-100 px-2 py-1 rounded-lg flex items-center gap-1"
                                >
                                  <Trash2 size={11}/> Excluir
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 mt-3">
                      <p className="text-[10px] font-bold text-gray-500 uppercase mb-2 flex items-center gap-1.5">
                        <ShieldCheck size={11} className="text-green-500"/> Log de Auditoria
                      </p>
                      <div className="space-y-1">
                        {fichas.map(f => (
                          <div key={f.id} className="text-[10px] text-gray-500 font-mono flex flex-wrap gap-2">
                            <span>{new Date(f.createdAt).toLocaleString('pt-BR')}</span>
                            <span className="text-gray-400">|</span>
                            <span>{f.tipo}</span>
                            <span className="text-gray-400">|</span>
                            <span>{f.auditCode}</span>
                            <span className="text-gray-400">|</span>
                            <span>hash: {f.contentHash.substring(0, 12)}…</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })()}

          {/* ─ Protocolos Gerados ─ */}
          {studentProtocols.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                <FileText size={15} className="text-brand-600"/>
                <span className="font-bold text-gray-800 text-sm">Documentos Gerados pelo Sistema</span>
                <span className="ml-auto text-xs text-gray-400">{studentProtocols.length} documento(s)</span>
              </div>
              <table className="w-full text-sm text-left">
                <thead className="text-[10px] text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-5 py-3 font-bold">Documento</th>
                    <th className="px-5 py-3 font-bold">Data</th>
                    <th className="px-5 py-3 font-bold">Status</th>
                    <th className="px-5 py-3 font-bold">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {studentProtocols.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50 transition">
                      <td className="px-5 py-3 font-bold text-gray-800">{p.type}</td>
                      <td className="px-5 py-3 text-gray-500 text-xs">{new Date(p.createdAt).toLocaleDateString('pt-BR')}</td>
                      <td className="px-5 py-3">{getStatusBadge(p.status)}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => onViewProtocol(p)} className="text-brand-600 hover:text-brand-800 text-xs font-bold border border-brand-200 px-3 py-1 rounded-lg">
                            Abrir
                          </button>
                          <button onClick={() => handleDeleteProtocol(p.id)} className="text-red-400 hover:text-red-600 border border-red-100 hover:border-red-300 p-1 rounded-lg" title="Excluir documento">
                            <Trash2 size={13}/>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 5 — ATIVIDADES GERADAS
         ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'atividades' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Zap size={18} className="text-brand-600"/> Atividades Geradas com IA
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">Histórico de atividades geradas para {student.name}.</p>
            </div>
            <button
              onClick={() => {
                setLoadingActivities(true);
                GeneratedActivityService.getForStudent(student.id)
                  .then(setDbActivities)
                  .catch(() => {})
                  .finally(() => setLoadingActivities(false));
              }}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-brand-600 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-brand-300 transition"
            >
              <RefreshCw size={13}/> Atualizar
            </button>
          </div>

          {loadingActivities ? (
            <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
              <RefreshCw size={16} className="animate-spin"/> Carregando atividades…
            </div>
          ) : dbActivities.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 text-center">
              <Zap size={36} className="mx-auto mb-3 text-gray-200"/>
              <p className="text-sm text-gray-500 font-semibold">Nenhuma atividade gerada ainda.</p>
              <p className="text-xs text-gray-400 mt-1">Gere atividades no IncluiLAB vinculando a este aluno.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Cabeçalho da tabela */}
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-5 py-3 bg-gray-50 border-b border-gray-100 text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                <span>Título / BNCC</span>
                <span className="text-center">Formato</span>
                <span className="text-center">Créditos</span>
                <span className="text-center">Data</span>
                <span className="text-center">Ações</span>
              </div>

              {/* Linhas */}
              <div className="divide-y divide-gray-50">
                {dbActivities.map(act => {
                  const bncc = (act.bncc_codes ?? []).slice(0, 2).join(', ');
                  const date = act.created_at ? new Date(act.created_at).toLocaleDateString('pt-BR') : '—';
                  const hasImage = !!(act.image_url) || act.output_type === 'text_image';
                  const modelLabel = act.model_used ?? 'padrão';

                  const handleDownloadText = () => {
                    if (!act.content) { alert('Sem conteúdo textual para baixar.'); return; }
                    const blob = new Blob([act.content], { type: 'text/plain;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${act.title ?? 'atividade'}.txt`;
                    a.click();
                    URL.revokeObjectURL(url);
                  };

                  const handleDownloadImage = () => {
                    if (!act.image_url) { alert('Nenhuma imagem disponível para esta atividade.'); return; }
                    const a = document.createElement('a');
                    a.href = act.image_url;
                    a.download = `${act.title ?? 'imagem'}.png`;
                    a.target = '_blank';
                    a.click();
                  };

                  const handleDuplicate = async () => {
                    const tenantId = (user as any)?.tenant_id;
                    if (!tenantId) return;
                    await GeneratedActivityService.save({
                      tenantId,
                      userId: (user as any)?.id ?? '',
                      studentId: student.id,
                      title: `Cópia — ${act.title ?? 'Atividade'}`,
                      content: act.content ?? '',
                      imageUrl: act.image_url ?? undefined,
                      bnccCodes: act.bncc_codes ?? [],
                      discipline: act.discipline ?? undefined,
                      guidance: act.guidance ?? undefined,
                      tags: act.tags ?? [],
                      isAdapted: act.is_adapted ?? false,
                      creditsUsed: 0,
                    });
                    // Recarrega
                    const updated = await GeneratedActivityService.getForStudent(student.id);
                    setDbActivities(updated);
                    alert('Atividade duplicada com sucesso!');
                  };

                  return (
                    <div key={act.id} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-5 py-3 items-center hover:bg-gray-50 transition text-sm">
                      {/* Título + BNCC */}
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-800 truncate">{act.title ?? 'Sem título'}</p>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {act.discipline && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-700 font-semibold">{act.discipline}</span>
                          )}
                          {bncc && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 font-mono">{bncc}</span>
                          )}
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">{modelLabel}</span>
                        </div>
                      </div>

                      {/* Formato */}
                      <div className="flex items-center gap-1 justify-center">
                        <FileText size={13} className="text-gray-400"/>
                        {hasImage && <Image size={13} className="text-brand-500"/>}
                      </div>

                      {/* Créditos */}
                      <span className="text-center text-xs font-semibold text-gray-500">{act.credits_used ?? 0}</span>

                      {/* Data */}
                      <span className="text-center text-xs text-gray-400 whitespace-nowrap">{date}</span>

                      {/* Ações */}
                      <div className="flex items-center gap-1 justify-center">
                        <button
                          onClick={handleDownloadText}
                          title="Baixar texto"
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-brand-600 transition"
                        >
                          <Download size={13}/>
                        </button>
                        {hasImage && (
                          <button
                            onClick={handleDownloadImage}
                            title="Baixar imagem"
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-purple-600 transition"
                          >
                            <Image size={13}/>
                          </button>
                        )}
                        <button
                          onClick={handleDuplicate}
                          title="Duplicar"
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-green-600 transition"
                        >
                          <Copy size={13}/>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 6 — LINHA DO TEMPO
         ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'timeline' && (
        <StudentTimeline
          student={student}
          protocols={studentProtocols}
          serviceRecords={serviceRecords}
          docs={dbDocs}
          dbEvents={dbTimeline}
        />
      )}

      {/* ── Modal: Documento Complementar (Sprint 5B) ── */}
      {quickDocType && (
        <QuickDocModal
          docType={quickDocType}
          student={student}
          user={user as any}
          school={(user as any)?.schoolConfigs?.[0] ?? null}
          onClose={() => setQuickDocType(null)}
        />
      )}

      {/* ── Modal: Geração em Lote ── */}
      {showBatchModal && (
        <div className="fixed inset-0 z-[90] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Sparkles size={18} className="text-brand-600"/> Gerar Documentos em Lote
              </h3>
              {!batchRunning && <button onClick={() => setShowBatchModal(false)}><X size={20} className="text-gray-400 hover:text-gray-700"/></button>}
            </div>

            {batchProgress.length === 0 ? (
              <>
                <p className="text-sm text-gray-500 mb-4">Selecione os documentos a gerar para <strong>{student.name}</strong>. A ordem de geração é fixa: Estudo de Caso → PAEE → PEI.</p>
                <div className="space-y-2 mb-5">
                  {BATCH_TYPES.map(t => (
                    <label key={t.id as string} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={batchSelected.includes(t.id as string)}
                        onChange={e => setBatchSelected(prev => e.target.checked ? [...prev, t.id as string] : prev.filter(x => x !== (t.id as string)))}
                        className="w-4 h-4 accent-brand-600"
                      />
                      <div>
                        <p className="text-sm font-bold text-gray-800">{t.label}</p>
                        <p className="text-xs text-gray-400">3 créditos</p>
                      </div>
                    </label>
                  ))}
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-4 text-xs text-amber-700">
                  Consumirá <strong>{batchSelected.length * 3} créditos</strong> no total. Os documentos serão salvos como rascunho.
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowBatchModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50">Cancelar</button>
                  <button onClick={handleBatchGenerate} disabled={batchSelected.length === 0} className="flex-1 bg-brand-600 text-white py-2.5 rounded-xl font-bold hover:bg-brand-700 text-sm disabled:opacity-50">
                    Gerar {batchSelected.length} documento{batchSelected.length !== 1 ? 's' : ''}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-500 mb-4">Gerando documentos para <strong>{student.name}</strong>…</p>
                <div className="space-y-3 mb-5">
                  {batchProgress.map(p => {
                    const label = BATCH_TYPES.find(t => (t.id as string) === p.type)?.label ?? p.type;
                    const icon = p.status === 'done' ? '✓' : p.status === 'error' ? '✕' : p.status === 'generating' ? '⋯' : '·';
                    const color = p.status === 'done' ? 'bg-green-50 border-green-200 text-green-700' : p.status === 'error' ? 'bg-red-50 border-red-200 text-red-700' : p.status === 'generating' ? 'bg-brand-50 border-brand-200 text-brand-700' : 'bg-gray-50 border-gray-200 text-gray-500';
                    return (
                      <div key={p.type} className={`flex items-center gap-3 p-3 rounded-xl border ${color}`}>
                        <span className="text-base font-bold w-5 text-center">{icon}</span>
                        <div className="flex-1">
                          <p className="text-sm font-bold">{label}</p>
                          {p.msg && <p className="text-xs mt-0.5 opacity-80">{p.msg}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {!batchRunning && (
                  <button onClick={() => { setShowBatchModal(false); setActiveTab('documentos'); }} className="w-full bg-gray-900 text-white py-2.5 rounded-xl font-bold hover:bg-black text-sm">
                    Ver Documentos Gerados
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Modal: Visualizar Documento ── */}
      {docPreview && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="font-bold text-gray-800 truncate text-sm">{docPreview.name}</div>
              <button onClick={() => setDocPreview(null)} className="p-2 rounded-lg hover:bg-gray-50 text-gray-500"><X size={18}/></button>
            </div>
            <div className="h-[75vh] bg-gray-50">
              <iframe src={docPreview.url} title={docPreview.name} className="w-full h-full"/>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Vertical Timeline ────────────────────────────────────────────────────────
interface TimelineProps {
  student: Student;
  protocols: Protocol[];
  serviceRecords: ServiceRecord[];
  docs: any[];
  dbEvents?: any[]; // eventos da tabela student_timeline
}

const TYPE_COLORS: Record<string, { bg: string; border: string; color: string }> = {
  protocolo:   { bg: '#EFF9FF', border: '#BAE6FD', color: '#1F4E5F' },
  atendimento: { bg: '#F0FDF4', border: '#BBF7D0', color: '#166534' },
  laudo:       { bg: '#FDF6E3', border: '#FDE68A', color: '#92400E' },
  matricula:   { bg: '#F3F4F6', border: '#E5E7EB', color: '#374151' },
  ficha:       { bg: '#F5F3FF', border: '#DDD6FE', color: '#5B21B6' },
  evolucao:    { bg: '#FDF4FF', border: '#E9D5FF', color: '#7C3AED' },
  documento:   { bg: '#F0F9FF', border: '#BAE6FD', color: '#0369A1' },
};

function StudentTimeline({ student, protocols, serviceRecords, docs, dbEvents = [] }: TimelineProps) {
  type EventType = {
    id: string;
    date: string;
    type: string;
    title: string;
    subtitle?: string;
    fromDb?: boolean;
  };

  // Eventos locais (protocolos, atendimentos, documentos, cadastro)
  const localEvents: EventType[] = [
    ...(student.registrationDate
      ? [{ id: 'reg', date: student.registrationDate, type: 'matricula',
           title: 'Aluno cadastrado no sistema',
           subtitle: student.tipo_aluno === 'em_triagem' ? 'Modo Triagem' : 'Com Laudo' }]
      : []),
    ...protocols.map(p => ({
      id: p.id, date: p.createdAt, type: 'protocolo',
      title: String(p.type), subtitle: p.status === 'FINAL' ? 'Finalizado' : 'Rascunho',
    })),
    ...(docs ?? []).map((d, i) => ({
      id: d.id ?? `doc_${i}`,
      date: d.date ? new Date(d.date.split('/').reverse().join('-')).toISOString() : new Date().toISOString(),
      type: 'laudo', title: d.name, subtitle: d.type,
    })),
    ...serviceRecords.map(r => ({
      id: r.id, date: r.date, type: 'atendimento',
      title: `${r.type} — ${r.professional}`, subtitle: r.attendance,
    })),
  ];

  // Eventos do banco (student_timeline) — convertidos para o mesmo formato
  const bankEvents: EventType[] = dbEvents.map((e: any) => ({
    id:       e.id,
    date:     e.event_date ? `${e.event_date}T00:00:00` : e.created_at,
    type:     e.event_type ?? 'documento',
    title:    e.title,
    subtitle: e.description ?? (e.author ? `por ${e.author}` : undefined),
    fromDb:   true,
  }));

  // Mescla: se há eventos do banco, usa somente eles (são mais completos);
  // senão, usa eventos locais. Evita duplicação.
  const events: EventType[] = (bankEvents.length > 0 ? bankEvents : localEvents)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const fmtDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return iso; }
  };

  const typeLabel: Record<string, string> = {
    protocolo: 'Documento', atendimento: 'Atendimento', laudo: 'Laudo/Relatório',
    matricula: 'Cadastro', ficha: 'Ficha', evolucao: 'Evolução', documento: 'Documento',
  };

  return (
    <div className="mt-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2">
            <Activity size={18} className="text-brand-600"/> Linha do Tempo
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">Histórico completo de {student.name}</p>
        </div>
        <div className="flex items-center gap-2">
          {bankEvents.length > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-bold">
              banco · {bankEvents.length} eventos
            </span>
          )}
          <span className="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-600 font-bold">{events.length} eventos</span>
        </div>
      </div>

      {events.length === 0 && (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center">
          <Activity size={32} className="mx-auto mb-3 text-gray-200"/>
          <p className="text-gray-400 text-sm">Nenhum evento registrado ainda.</p>
        </div>
      )}

      <div className="relative">
        <div className="absolute left-5 top-2 bottom-2 w-0.5 bg-gray-100"/>
        <div className="space-y-3">
          {events.map((ev, i) => {
            const cfg = TYPE_COLORS[ev.type] ?? TYPE_COLORS.matricula;
            const icon = (() => {
              switch (ev.type) {
                case 'protocolo':   case 'documento': return <FileText size={14} style={{ color: cfg.color }}/>;
                case 'atendimento':                   return <CheckCircle size={14} style={{ color: cfg.color }}/>;
                case 'laudo':                         return <Paperclip size={14} style={{ color: cfg.color }}/>;
                case 'ficha':                         return <ClipboardCheck size={14} style={{ color: cfg.color }}/>;
                case 'evolucao':                      return <TrendingUp size={14} style={{ color: cfg.color }}/>;
                default:                              return <User size={14} style={{ color: cfg.color }}/>;
              }
            })();
            return (
              <div key={`${ev.id}_${i}`} className="flex gap-4">
                <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 z-10 border-2"
                  style={{ background: cfg.bg, borderColor: cfg.border }}>
                  {icon}
                </div>
                <div className="flex-1 rounded-xl p-3 mb-1" style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ background: cfg.border, color: cfg.color }}>
                        {typeLabel[ev.type] ?? ev.type}
                      </span>
                      <p className="text-sm font-bold mt-1 text-gray-800">{ev.title}</p>
                      {ev.subtitle && <p className="text-xs mt-0.5 text-gray-500">{ev.subtitle}</p>}
                    </div>
                    <span className="text-[10px] whitespace-nowrap text-gray-400">{fmtDate(ev.date)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
