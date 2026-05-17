import React, { useMemo, useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { SchoolSetupBanner } from './components/SchoolSetupBanner';
import { StudentContextService } from './services/studentContextService';
import type { StudentContext } from './services/studentContextService';

// ── Lazy views — não incluídas no bundle inicial ──────────────────────────────
const LoginScreen       = React.lazy(() => import('./components/LoginScreen').then(m => ({ default: m.LoginScreen })));
const DashboardView     = React.lazy(() => import('./views/DashboardView').then(m => ({ default: m.DashboardView })));
const LandingPage       = React.lazy(() => import('./views/LandingPage').then(m => ({ default: m.LandingPage })));
const ForgotPasswordView    = React.lazy(() => import('./views/ForgotPasswordView').then(m => ({ default: m.ForgotPasswordView })));
const ForceChangePasswordView = React.lazy(() => import('./views/ForceChangePasswordView').then(m => ({ default: m.ForceChangePasswordView })));
const AdminDashboard        = React.lazy(() => import('./views/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const StudentsListView      = React.lazy(() => import('./views/StudentsListView').then(m => ({ default: m.StudentsListView })));
const ReportsView           = React.lazy(() => import('./views/ReportsView').then(m => ({ default: m.ReportsView })));
const AppointmentsView      = React.lazy(() => import('./views/AppointmentsView').then(m => ({ default: m.AppointmentsView })));
const SchoolTemplatesView   = React.lazy(() => import('./views/SchoolTemplatesView').then(m => ({ default: m.SchoolTemplatesView })));
const PrintableTemplatesView = React.lazy(() => import('./views/PrintableTemplatesView').then(m => ({ default: m.PrintableTemplatesView })));
const FichasComplementaresView = React.lazy(() => import('./views/FichasComplementaresView').then(m => ({ default: m.FichasComplementaresView })));
const FichasHistoricosView  = React.lazy(() => import('./views/FichasHistoricosView').then(m => ({ default: m.FichasHistoricosView })));
const TriagemView           = React.lazy(() => import('./views/TriagemView').then(m => ({ default: m.TriagemView })));
const ServiceControlView    = React.lazy(() => import('./views/ServiceControlView').then(m => ({ default: m.ServiceControlView })));
const SubscriptionView      = React.lazy(() => import('./views/SubscriptionView').then(m => ({ default: m.SubscriptionView })));
const IncluiLabView         = React.lazy(() => import('./views/IncluiLabView').then(m => ({ default: m.IncluiLabView })));
const MessagesView          = React.lazy(() => import('./views/MessagesView').then(m => ({ default: m.MessagesView })));
const HelpCenterView        = React.lazy(() => import('./views/HelpCenterView').then(m => ({ default: m.HelpCenterView })));
const SettingsView          = React.lazy(() => import('./views/SettingsView').then(m => ({ default: m.SettingsView })));

// ── Lazy components pesados ───────────────────────────────────────────────────
const StudentForm     = React.lazy(() => import('./components/StudentForm').then(m => ({ default: m.StudentForm })));
const StudentProfile  = React.lazy(() => import('./components/StudentProfile').then(m => ({ default: m.StudentProfile })));
const DocumentBuilder = React.lazy(() => import('./components/DocumentBuilder').then(m => ({ default: m.DocumentBuilder })));
const EnrollmentWizard = React.lazy(() => import('./components/EnrollmentWizard').then(m => ({ default: m.EnrollmentWizard })));
import {
  PlanTier,
  UserRole,
  DocumentType,
  Student,
  Protocol,
  Appointment,
  User,
  SchoolConfig,
  DocumentData,
  getPlanLimits,
  DocumentVersion,
  SubscriptionStatus,
  TenantType,
  ProtocolStatus,
  ServiceRecord,
  formatPlanDisplayName,
  formatStudentLimit,
  resolvePlanTier,
} from './types';
import { ShieldCheck, Menu, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { ReferralService } from './services/referralService';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LGPDModal } from './components/LGPDModal';
import { ExpiredPlanBanner } from './components/ExpiredPlanBanner';
import { PaymentService } from './services/paymentService';
import { shouldShowExpiredBanner, getActiveSubscription, type ActiveSubscriptionInfo } from './services/subscriptionService';
import { getSubscriptionCheckoutUrl } from './services/kiwifyService';
import { checkPurchaseByEmail, activatePurchaseForUser } from './services/purchaseActivationService';
import { ActivationView } from './components/ActivationView';
import { BrandLogo } from './components/BrandLogo';
import { supabase, DEMO_MODE } from './services/supabase';
import { databaseService, DuplicateStudentError } from './services/databaseService';
import { ServiceRecordService, AppointmentService } from './services/persistenceService';
import { NotificationsPanel } from './components/NotificationsPanel';
import { WhatsAppFloatButton } from './components/common/WhatsAppFloatButton';
import { StudentSearchService } from './services/studentSearchService';
import { ensureDocumentCode, getDocumentCodeKind } from './utils/documentCodes';

// ── Suspense fallback ─────────────────────────────────────────────────────────
const PageLoader = () => (
  <div className="flex items-center justify-center h-48">
    <div className="w-8 h-8 rounded-full border-2 border-[#1F4E5F] border-t-transparent animate-spin" />
  </div>
);

// --- Helper ---
const generateAuditCode = (docType: DocumentType, existing?: string) =>
  ensureDocumentCode(getDocumentCodeKind(docType), existing);

// ── Helpers de máscara (usados no modal) ────────────────────────────────────
function _applyPhoneMask(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2)  return d.replace(/(\d{1,2})/, '($1');
  if (d.length <= 6)  return d.replace(/(\d{2})(\d+)/, '($1) $2');
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d+)/, '($1) $2-$3');
  return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
}
function _applyCPFMask(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3)  return d;
  if (d.length <= 6)  return d.replace(/(\d{3})(\d+)/, '$1.$2');
  if (d.length <= 9)  return d.replace(/(\d{3})(\d{3})(\d+)/, '$1.$2.$3');
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d+)/, '$1.$2.$3-$4');
}
function _validateCPF(cpf: string): boolean {
  const d = cpf.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += parseInt(d[i]) * (len + 1 - i);
    const rem = (sum * 10) % 11;
    return rem === 10 ? 0 : rem;
  };
  return calc(9) === parseInt(d[9]) && calc(10) === parseInt(d[10]);
}

// ── Banner de cadastro incompleto ────────────────────────────────────────────
const ContactDataBanner: React.FC<{ onUpdate: () => void; onDismiss: () => void }> = ({ onUpdate, onDismiss }) => (
  <div
    style={{
      background: '#FEF3C7',
      borderBottom: '1px solid #FCD34D',
      padding: '10px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      fontSize: 13,
      color: '#92400E',
    }}
  >
    <ShieldCheck size={16} style={{ color: '#D97706', flexShrink: 0 }} />
    <span style={{ flex: 1 }}>
      <strong>Cadastro incompleto:</strong> adicione seu telefone e CPF para proteger sua conta e permitir recuperação de acesso sem e-mail.
    </span>
    <button
      onClick={onUpdate}
      style={{
        background: '#D97706',
        color: 'white',
        border: 'none',
        borderRadius: 8,
        padding: '5px 14px',
        fontWeight: 700,
        fontSize: 12,
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      Atualizar dados
    </button>
    <button
      onClick={onDismiss}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#92400E', padding: 4, flexShrink: 0 }}
      aria-label="Fechar"
    >
      <X size={14} />
    </button>
  </div>
);

// ── Modal de atualização de contato ──────────────────────────────────────────
const ContactDataModal: React.FC<{
  userId: string;
  onSave: (phone: string, cpf: string) => Promise<void>;
  onClose: () => void;
}> = ({ onSave, onClose }) => {
  const [phone, setPhone] = React.useState('');
  const [cpf, setCpf]     = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [err, setErr]     = React.useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length < 10) { setErr('Informe um telefone/WhatsApp válido com DDD.'); return; }
    if (!_validateCPF(cpf))       { setErr('CPF inválido. Verifique e tente novamente.'); return; }
    setLoading(true);
    try {
      await onSave(phone.trim(), cpf.replace(/\D/g, ''));
    } catch {
      setErr('Erro ao salvar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, padding: 16,
    }}>
      <div style={{
        background: 'white', borderRadius: 16, padding: 32,
        width: '100%', maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <h2 style={{ fontWeight: 800, fontSize: 18, color: '#111827', margin: '0 0 6px' }}>
          Completar cadastro
        </h2>
        <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 20px' }}>
          Esses dados protegem sua conta e permitem recuperação de acesso sem e-mail.
        </p>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              Telefone / WhatsApp
            </label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(_applyPhoneMask(e.target.value))}
              placeholder="(11) 99999-9999"
              required
              inputMode="numeric"
              style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #D1D5DB', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              CPF
            </label>
            <input
              type="text"
              value={cpf}
              onChange={e => setCpf(_applyCPFMask(e.target.value))}
              placeholder="000.000.000-00"
              required
              inputMode="numeric"
              style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #D1D5DB', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          {err && (
            <p style={{ fontSize: 12, color: '#DC2626', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '8px 12px', margin: 0 }}>
              {err}
            </p>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button
              type="submit"
              disabled={loading}
              style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: '#1F4E5F', color: 'white', fontWeight: 700, fontSize: 14, cursor: loading ? 'wait' : 'pointer' }}
            >
              {loading ? 'Salvando...' : 'Salvar'}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{ padding: '11px 18px', borderRadius: 10, border: '1.5px solid #E5E7EB', background: 'white', color: '#374151', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
            >
              Agora não
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- Mock Data ---
const INITIAL_SCHOOLS: SchoolConfig[] = [
  {
    id: '1',
    schoolName: 'Escola Modelo Inclusiva',
    managerName: 'Roberta Diretora',
    coordinatorName: 'Carlos Coord.',
    aeeRepresentative: 'Ana Souza',
    aeeRepName: 'Juliana Rep.',
    contact: '(11) 99999-9999',
    team: [
      { id: 't1', name: 'Profa. Maria', role: 'Professor Regente' },
      { id: 't2', name: 'Ana Souza', role: 'AEE' },
      { id: 't3', name: 'Carlos Coord.', role: 'Coordenador' },
    ],
  },
];

const MOCK_USER: User = {
  id: 'u1',
  tenant_id: 't1',
  name: 'Prof. Visitante',
  email: 'teste@incluiai.com',
  plan: PlanTier.FREE,
  schoolConfigs: INITIAL_SCHOOLS,
  role: UserRole.TEACHER,
  isAdmin: false,
  active: true,
  subscriptionStatus: 'ACTIVE',
  tenantType: TenantType.PROFESSIONAL,
  aiUsage: [],
};

// --- DocumentHistory View (inline simples) ---
const DocumentsHistoryView: React.FC<{
  protocols: Protocol[];
  students: Student[];
  onOpen: (p: Protocol) => void;
}> = ({ protocols, students, onOpen }) => {
  const [search, setSearch] = useState('');

  const filtered = protocols.filter(p => {
    const q = search.toLowerCase();
    return (
      p.studentName?.toLowerCase().includes(q) ||
      p.type?.toLowerCase().includes(q) ||
      p.auditCode?.toLowerCase().includes(q)
    );
  });

  const docLabel: Record<string, string> = {
    [DocumentType.ESTUDO_CASO]: 'Estudo de Caso',
    [DocumentType.PAEE]: 'PAEE',
    [DocumentType.PEI]: 'PEI',
    [DocumentType.PDI]: 'PDI',
  };

  const statusColor: Record<string, string> = {
    DRAFT: '#6B7280',
    FINAL: '#059669',
    ARCHIVED: '#9CA3AF',
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Histórico de Documentos</h1>
        <p className="text-gray-500 text-sm mt-1">Todos os documentos gerados para seus alunos</p>
      </div>

      <input
        className="w-full max-w-md border border-gray-200 rounded-lg px-4 py-2 text-sm mb-6 focus:outline-none focus:ring-2 focus:ring-brand-400"
        placeholder="Buscar por aluno, tipo ou código..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg font-medium">Nenhum documento encontrado</p>
          <p className="text-sm mt-1">Gere documentos na seção de Documentação</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map(p => (
            <div
              key={p.id}
              className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between hover:shadow-sm transition cursor-pointer"
              onClick={() => onOpen(p)}
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-800 text-sm">
                    {docLabel[p.type] || p.type}
                  </span>
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{
                      color: statusColor[p.status] || '#6B7280',
                      background: `${statusColor[p.status] || '#6B7280'}18`,
                    }}
                  >
                    {p.status}
                  </span>
                </div>
                <span className="text-gray-600 text-sm">{p.studentName}</span>
                <span className="text-gray-400 text-xs font-mono">{p.auditCode}</span>
              </div>
              <div className="text-right text-xs text-gray-400">
                <div>{new Date(p.lastEditedAt || p.createdAt).toLocaleDateString('pt-BR')}</div>
                <div className="text-[10px] mt-0.5">{p.versions?.length ?? 1} versão(ões)</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// --- App ---
const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Detecta rota inicial via pathname para /login e /cadastro
  const detectInitialView = () => {
    const path = window.location.pathname;
    if (path.startsWith('/validar')) return 'audit';
    if (path === '/login') return 'login';
    if (path === '/cadastro') return 'login';
    return 'landing';
  };
  const detectInitialAuditCode = () => {
    const match = window.location.pathname.match(/^\/validar\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]).toUpperCase() : '';
  };
  const detectInitialTab = (): 'login' | 'register' => {
    const path = window.location.pathname;
    if (path === '/cadastro') return 'register';
    return 'login';
  };

  const [view, setView] = useState(detectInitialView);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [loginInitialTab, setLoginInitialTab] = useState<'login' | 'register'>(detectInitialTab);
  const [unreadMessages, setUnreadMessages] = useState(0);

  const [user, setUser] = useState<User>(MOCK_USER);
  const [students, setStudents] = useState<Student[]>([]);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [serviceRecords, setServiceRecords] = useState<ServiceRecord[]>([]);

  const [viewingStudent, setViewingStudent] = useState<Student | null>(null);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [showEnrollmentWizard, setShowEnrollmentWizard] = useState(false);
  const [enrollmentTipo, setEnrollmentTipo] = useState<'em_triagem' | 'com_laudo'>('em_triagem');

  const [generating, setGenerating] = useState(false);
  const [currentProtocol, setCurrentProtocol] = useState<Protocol | null>(null);
  const [activeDocumentType, setActiveDocumentType] = useState<DocumentType>(DocumentType.PEI);

  const [auditSearch, setAuditSearch] = useState(detectInitialAuditCode);
  const [auditResult, setAuditResult] = useState<{ found: boolean; type?: string; studentName?: string; issuedAt?: string; code?: string } | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [showLGPD, setShowLGPD] = useState(false); // inicializado false — verificação real ocorre no _loadAfterAuth
  // Toast inline — substitui alert() para eventos de vínculo de aluno
  const [toastMsg, setToastMsg]   = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const _toastTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMsg({ text, type });
    if (_toastTimer.current) clearTimeout(_toastTimer.current);
    _toastTimer.current = setTimeout(() => setToastMsg(null), 5000);
  };
  // E-mail pré-preenchido vindo do redirect pós-pagamento da Kiwify (?activate=1&email=...)
  const [activationEmail, setActivationEmail] = useState('');
  // Banner para usuárias antigas sem phone/cpf cadastrados
  const [showContactBanner, setShowContactBanner] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);

  const [tenantSummary, setTenantSummary] = useState<any | null>(null);
  const [effectivePlans, setEffectivePlans] = useState<any[]>([]);
  const [activeSubscription, setActiveSubscription] = useState<ActiveSubscriptionInfo | null>(null);

  // planCode: código canônico do banco (FREE | PRO | MASTER)
  const planCode = useMemo(() => {
    if (user.plan === PlanTier.PREMIUM) return 'MASTER';
    if (user.plan === PlanTier.PRO) return 'PRO';
    return 'FREE';
  }, [user.plan]);

  // planName: CÓDIGO do plano (usado para lookups e condicionais de feature gates)
  const planName = planCode;

  // planDisplayName: nome de exibição com ciclo — fonte única para a UI
  // Ex: "PREMIUM MENSAL", "PRO ANUAL", "FREE"
  const planDisplayName = useMemo(() => {
    // 1ª fonte: tenantSummary (vem do banco com billing_cycle real)
    if (tenantSummary?.planDisplayName) return tenantSummary.planDisplayName;
    // Fallback: sem ciclo (billing_cycle ainda não carregou)
    return formatPlanDisplayName(planCode, tenantSummary?.billingCycle ?? 'monthly');
  }, [tenantSummary?.planDisplayName, tenantSummary?.billingCycle, planCode]);

  const planEff = useMemo(() => {
    const found = effectivePlans.find((p: any) => String(p?.name ?? '').toUpperCase() === planName);
    return found ?? null;
  }, [effectivePlans, planName]);

  const planMaxStudents = useMemo(() => {
    const fromSummary = Number(tenantSummary?.studentLimitBase);
    if (Number.isFinite(fromSummary) && fromSummary > 0) return fromSummary;
    const fromPlanEff = Number(planEff?.max_students);
    if (Number.isFinite(fromPlanEff) && fromPlanEff > 0) return fromPlanEff;
    const fromStatic = (getPlanLimits(user.plan) as any)?.students;
    if (typeof fromStatic === 'number' && fromStatic > 0) return fromStatic;
    return 0;
  }, [planEff?.max_students, tenantSummary?.studentLimitBase, user.plan]);

  // Label de exibição do limite de alunos: "Ilimitado" para MASTER, número para outros.
  const planMaxStudentsLabel = useMemo(
    () => formatStudentLimit(planMaxStudents),
    [planMaxStudents]
  );

  const planMonthlyCredits = useMemo(() => {
    // 1ª fonte: tenantSummary (vem do banco via getTenantSummary → plans.ai_credits_per_month)
    const fromSummary = Number(tenantSummary?.planCreditsMonthly ?? 0);
    if (Number.isFinite(fromSummary) && fromSummary > 0) return fromSummary;
    // 2ª fonte: planEff carregado via getEffectivePlans (alias monthly_credits)
    const fromDB = Number(planEff?.monthly_credits ?? planEff?.credits_monthly ?? 0);
    if (Number.isFinite(fromDB) && fromDB > 0) return fromDB;
    // Fallback: limites estáticos (types.ts PLAN_LIMITS)
    return (getPlanLimits(user.plan) as any).ai_credits ?? 0;
  }, [tenantSummary?.planCreditsMonthly, planEff?.monthly_credits, planEff?.credits_monthly, user.plan]);

  const creditsAvailable = useMemo(() => {
    // Enquanto tenantSummary não carregou, usa créditos do plano como fallback
    if (tenantSummary === null) {
      return planMonthlyCredits > 0 ? planMonthlyCredits : (getPlanLimits(user.plan) as any).ai_credits ?? 0;
    }
    // Fonte única de verdade: credits_wallet.balance (via aiCreditsRemaining)
    return Math.max(0, Number(tenantSummary.aiCreditsRemaining ?? 0));
  }, [tenantSummary, planMonthlyCredits, user.plan]);

  // Créditos comprados e consumidos (do ledger, via tenantSummary)
  const creditsPurchased = useMemo(() => Number(tenantSummary?.creditsPurchased ?? 0), [tenantSummary?.creditsPurchased]);
  const creditsConsumedCycle = useMemo(() => Number(tenantSummary?.creditsConsumedCycle ?? 0), [tenantSummary?.creditsConsumedCycle]);

  const creditsResetAt = useMemo(() => {
    return (tenantSummary?.renewalDateCredits ?? null) as string | null;
  }, [tenantSummary?.renewalDateCredits]);

  // --- Captura ?ref=, ?activate=1 da URL e gerencia histórico /login /cadastro ---
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) ReferralService.saveRefToStorage(ref);
    // Redirecionamento pós-pagamento da Kiwify
    if (params.get('activate') === '1') {
      const emailParam = params.get('email') ?? '';
      if (emailParam) setActivationEmail(emailParam);
      setView('activation');
      window.history.replaceState({}, '', window.location.pathname);
    }

    // Listener do botão Voltar do navegador
    const handlePopState = (e: PopStateEvent) => {
      const state = e.state as { view?: string; tab?: string } | null;
      if (state?.view) {
        setView(state.view);
        if (state.tab === 'register' || state.tab === 'login') {
          setLoginInitialTab(state.tab as 'login' | 'register');
        }
      } else {
        // Sem estado salvo → volta para landing
        setView('landing');
        window.history.replaceState({}, '', '/');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // --- Refresh de créditos após operações de IA (sem re-login) ---
  useEffect(() => {
    const handleCreditsChanged = async (e: Event) => {
      const userId = (e as CustomEvent).detail?.userId || user?.id;
      if (!userId || DEMO_MODE) return;
      try {
        const summaryDb = await databaseService.getTenantSummary(userId);
        setTenantSummary(summaryDb);
      } catch {}
    };
    window.addEventListener('incluiai:credits-changed', handleCreditsChanged);
    return () => window.removeEventListener('incluiai:credits-changed', handleCreditsChanged);
  }, [user?.id]);

  // --- Contagem de mensagens não lidas (polling leve) ---
  useEffect(() => {
    if (!isAuthenticated || DEMO_MODE) return;
    const refresh = () =>
      StudentSearchService.getUnreadCount().then(setUnreadMessages).catch(() => {});
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, [isAuthenticated]);

    // --- Restore session (inclui retorno de OAuth Google e confirmacao de e-mail) ---
  useEffect(() => {
    if (DEMO_MODE) return;

    // Flag para evitar double-load caso getSession e onAuthStateChange disparem juntos
    let loaded = false;

    const loadAuthUser = async (userId: string) => {
      if (loaded) return;
      // Retry curto: trigger pode estar em processamento no primeiro acesso pós-cadastro/OAuth
      let profile: User | null = null;
      for (let i = 0; i < 5; i++) {
        if (i > 0) await new Promise(r => setTimeout(r, 700));
        profile = await databaseService.getUserProfile(userId).catch(() => null);
        if (profile) break;
      }
      // Fallback para usuários OAuth (Google) cujo trigger não disparou:
      // chama a RPC ensure_user_profile que cria o perfil on-demand.
      if (!profile) {
        try {
          await supabase.rpc('ensure_user_profile');
          await new Promise(r => setTimeout(r, 500));
          profile = await databaseService.getUserProfile(userId).catch(() => null);
        } catch { /* silencioso */ }
      }
      if (!profile || loaded) return;
      loaded = true;
      await _loadAfterAuth(profile).catch(() => {});
    };

    // 1. Sessao ja existente (refresh da pagina)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) loadAuthUser(session.user.id);
    });

    // 2. Novos eventos de auth: retorno de confirmacao de e-mail, OAuth callback
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user?.id) {
        loadAuthUser(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Realtime subscription status ---
  useEffect(() => {
    if (!isAuthenticated || !user.tenant_id || DEMO_MODE) return;

    const channel = supabase
      .channel(`sub-status-${user.tenant_id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'subscriptions', filter: `tenant_id=eq.${user.tenant_id}` },
        (payload) => {
          const row = payload.new as any;
          setActiveSubscription(prev => prev ? {
            ...prev,
            status: row.status ?? prev.status,
            planCode: row.plan_code ?? prev.planCode,
            providerPaymentLink: row.provider_payment_link ?? prev.providerPaymentLink,
            providerUpdatePaymentLink: row.provider_update_payment_link ?? prev.providerUpdatePaymentLink,
            currentPeriodEnd: row.current_period_end ?? prev.currentPeriodEnd,
            nextDueDate: row.next_due_date ?? prev.nextDueDate,
            lastPaymentStatus: row.last_payment_status ?? prev.lastPaymentStatus,
            isTestAccount: row.is_test_account ?? prev.isTestAccount,
          } : null);
          if (row.status) {
            setUser(prev => ({ ...prev, subscriptionStatus: row.status as SubscriptionStatus }));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isAuthenticated, user.tenant_id]);

  // Chave localStorage para plano pendente de upgrade (persiste entre redirects OAuth)
  const PENDING_PLAN_KEY = 'incluiai:pending_plan';

  // ── Helper: carrega dados do usuário após autenticação ─────────────────────
  const _loadAfterAuth = async (profile: User) => {
    const lgpdAlreadyAccepted = localStorage.getItem('incluiai_lgpd_accepted') === 'true';
    const needsLGPD = !lgpdAlreadyAccepted && !profile.lgpdConsent?.accepted;
    // Escola não é mais pré-requisito: o banner SchoolSetupBanner guia o usuário
    // a completar os dados sem bloquear o acesso ao dashboard.

    if (needsLGPD) setShowLGPD(true);

    setUser(profile);
    setIsAuthenticated(true);
    const isCeo = profile.isAdmin || String(profile.role ?? '').toUpperCase() === 'CEO';

    // Banner discreto para usuárias sem phone/cpf (não bloqueia uso)
    if (!isCeo && !DEMO_MODE && !profile.phone && !profile.cpf) {
      setShowContactBanner(true);
    }

    // Upgrade pendente (fluxo login-first) — redireciona para Kiwify ANTES de mostrar o dashboard
    const pendingPlan = localStorage.getItem(PENDING_PLAN_KEY) as 'PRO' | 'MASTER' | null;
    if (pendingPlan && profile.tenant_id) {
      localStorage.removeItem(PENDING_PLAN_KEY);
      try {
        const url = await getSubscriptionCheckoutUrl(pendingPlan, profile.tenant_id);
        if (url && url !== '#') {
          window.location.href = url; // mesma aba — usuário não vê o dashboard FREE
          return;
        }
      } catch { /* fallback — continua fluxo normal */ }
    }

    // Força troca de senha antes de qualquer outra tela (exceto CEO)
    if (!isCeo && profile.must_change_password) {
      setView('force_change_password');
    } else {
      setView(isCeo ? 'admin' : needsLGPD ? 'settings' : 'dashboard');
    }

    // ── Verifica compra aprovada pelo e-mail (pós-pagamento sem tenant_id) ─
    // Cobre: login normal, login com Google, retorno após confirmação de e-mail.
    if (!DEMO_MODE && profile.email && profile.tenant_id) {
      checkPurchaseByEmail(profile.email)
        .then(async (purchase) => {
          if (
            purchase.found &&
            purchase.status === 'APPROVED' &&
            purchase.purchase_id &&
            purchase.product_key !== 'UNKNOWN'
          ) {
            const result = await activatePurchaseForUser(purchase.purchase_id);
            if (result.ok && profile.tenant_id) {
              // Atualiza plano e status no estado local sem re-login
              const subInfo = await getActiveSubscription(profile.tenant_id).catch(() => null);
              if (subInfo) {
                setActiveSubscription(subInfo);
                setUser(prev => ({
                  ...prev,
                  subscriptionStatus: subInfo.status,
                  plan: resolvePlanTier(subInfo.planCode),
                }));
              }
              // Notifica o usuário que o plano foi ativado automaticamente
              if (result.reason !== 'already_activated') {
                const planLabel = result.plan === 'MASTER' ? 'Master' : result.plan ?? 'pago';
                showToast(`Encontramos sua assinatura. Plano ${planLabel} ativado com sucesso!`, 'success');
              }
            }
          }
        })
        .catch(() => { /* não crítico — não bloqueia o fluxo */ });
    }

    const [studentsDb, protocolsDb, summaryDb, plansDb, subInfo, serviceRecordsDb, appointmentsDb] = await Promise.all([
      databaseService.getStudents(profile.id),
      databaseService.getProtocols(profile.id),
      databaseService.getTenantSummary(profile.id),
      databaseService.getEffectivePlans(),
      profile.tenant_id ? getActiveSubscription(profile.tenant_id) : Promise.resolve(null),
      profile.tenant_id ? ServiceRecordService.list(profile.tenant_id) : Promise.resolve([]),
      AppointmentService.getAll(profile.id).catch(() => [] as Appointment[]),
    ]);

    setStudents(studentsDb);
    setProtocols(protocolsDb);
    setTenantSummary(summaryDb);
    setEffectivePlans(plansDb);
    setActiveSubscription(subInfo);
    setServiceRecords(serviceRecordsDb);
    setAppointments(appointmentsDb);
    if (subInfo) {
      setUser(prev => ({
        ...prev,
        subscriptionStatus: subInfo.status,
        plan: resolvePlanTier(subInfo.planCode),
      }));
    }

    // Referral pendente
    const pendingRef = ReferralService.getRefFromStorage();
    if (pendingRef && profile.id) {
      ReferralService.registerReferral(profile.id, pendingRef).catch(() => {});
    }
  };

  // --- Login ---
  const handleLogin = async (email: string, pass: string) => {
    if (DEMO_MODE) {
      setUser({ ...MOCK_USER, email, name: 'Modo Demonstração' });
      setIsAuthenticated(true);
      setView('dashboard');
      setEffectivePlans([
        { name: 'FREE', max_students: 5, monthly_credits: 60 },
        { name: 'PRO', max_students: 30, monthly_credits: 500 },
        { name: 'MASTER', max_students: 9999, monthly_credits: 700 },
      ]);
      setTenantSummary({ aiCreditsRemaining: 0, studentLimitBase: 5, renewalDateCredits: null });
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) throw error;

    const userId = data.user?.id;
    if (!userId) throw new Error('Falha ao obter usuário autenticado.');

    // Retry: perfil pode estar em processamento logo apos o primeiro cadastro
    let profile: User | null = null;
    for (let i = 0; i < 4; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 600));
      profile = await databaseService.getUserProfile(userId).catch(() => null);
      if (profile) break;
    }
    if (!profile) throw new Error('Perfil não encontrado. Confirme seu e-mail ou contate o suporte.');

    await _loadAfterAuth(profile);
  };

  // --- Cadastro ---
  const handleRegister = async (name: string, email: string, pass: string, phone: string, cpf: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password: pass,
      options: { data: { full_name: name } },
    });
    if (error) throw error;

    const userId = data.user?.id;
    if (!userId) throw new Error('Usuário criado, mas ID não retornado.');

    // Sem sessão = Supabase exige confirmação de e-mail.
    // Retornamos sem erro — LoginScreen exibirá a mensagem de sucesso.
    if (!data.session) return;

    // Com sessão ativa: aguarda o trigger criar o perfil (max ~6s, 8 tentativas)
    let profile: User | null = null;
    for (let i = 0; i < 8; i++) {
      await new Promise(r => setTimeout(r, 750));
      profile = await databaseService.getUserProfile(userId).catch(() => null);
      if (profile) break;
    }
    if (!profile) {
      throw new Error('Perfil em processamento. Aguarde alguns segundos e faça login.');
    }

    // Salva phone/cpf na tabela users (após trigger ter criado a linha)
    if (phone || cpf) {
      await supabase.from('users').update({
        phone: phone || null,
        cpf:   cpf   || null,
      }).eq('id', userId).catch(() => {/* não bloqueia cadastro */});
    }

    await _loadAfterAuth(profile);
  };

  // --- Login com Google ---
  const handleGoogleLogin = async () => {
    if (DEMO_MODE) {
      // Em modo demo não há Supabase configurado — simula login como visitante demo
      setUser({ ...MOCK_USER, email: 'demo@incluiai.com', name: 'Modo Demonstração' });
      setIsAuthenticated(true);
      setView('dashboard');
      setEffectivePlans([
        { name: 'FREE', max_students: 5, monthly_credits: 60 },
        { name: 'PRO', max_students: 30, monthly_credits: 500 },
        { name: 'MASTER', max_students: 9999, monthly_credits: 700 },
      ]);
      setTenantSummary({ aiCreditsRemaining: 0, studentLimitBase: 5, renewalDateCredits: null });
      return;
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    });
    if (error) throw error;
    // Navegador redireciona para Google — o restore session abaixo captura o retorno
  };

  // --- Upgrade gate: salva plano desejado e manda para auth ---
  const handleUpgradeClick = (planCode: 'PRO' | 'MASTER') => {
    localStorage.setItem(PENDING_PLAN_KEY, planCode);
    window.history.pushState({ view: 'login', tab: 'register' }, '', `/cadastro?plan=${planCode.toLowerCase()}`);
    setLoginInitialTab('register');
    setView('login');
  };

  const handleLGPDAccept = async () => {
    localStorage.setItem('incluiai_lgpd_accepted', 'true');
    try { await databaseService.acceptLGPD(user.id, { termVersion: 'v1.0' }); } catch {}
    setUser(prev => ({
      ...prev,
      lgpdConsent: { accepted: true, acceptedAt: new Date().toISOString(), ipAddress: '127.0.0.1', termVersion: 'v1.0' },
    }));
    setShowLGPD(false);
    setView('settings');
  };

  const handleLogout = async () => {
    try { if (!DEMO_MODE) await supabase.auth.signOut(); } catch {}
    setIsAuthenticated(false);
    window.history.replaceState({}, '', '/');
    setView('landing');
    setUser(MOCK_USER);
    setStudents([]);
    setProtocols([]);
    setTenantSummary(null);
    setEffectivePlans([]);
    setActiveSubscription(null);
    setViewingStudent(null);
    setEditingStudent(null);
    setCurrentProtocol(null);
  };

  const checkPermission = (feature: 'add_student' | 'ai_gen') => {
    const access = PaymentService.checkAccess(user);

    if (access.reason !== 'courtesy' && access.reason !== 'test_account') {
      if (!access.allowed && access.reason === 'payment_required') {
        alert('Sua assinatura está atrasada. Regularize para continuar.');
        return false;
      }
      if (!access.allowed && access.reason === 'subscription_ended') {
        alert('Sua assinatura foi cancelada. Reative para continuar.');
        return false;
      }
    }

    const legacy = getPlanLimits(user.plan);

    if (feature === 'add_student') {
      const limit = planMaxStudents > 0 ? planMaxStudents : (legacy as any).students;
      return students.length < limit;
    }

    if (feature === 'ai_gen') {
      // Só bloqueia se sabemos com certeza que os créditos são 0.
      // Se tenantSummary não carregou ainda (null), libera para não travar.
      if (tenantSummary === null) return true;
      return creditsAvailable > 0;
    }

    return true;
  };

  const triggerUpgrade = () => alert('Limite do plano atingido. Faça upgrade para continuar.');

  // --- Student handlers ---
  const handleSelectStudent = (student: Student) => {
    setViewingStudent(student);
    setView('student_profile');
  };

  const saveStudent = async (studentData: Student) => {
    try {
      if (import.meta.env.DEV) {
        console.info('[App.saveStudent] payload recebido', {
          ...studentData,
          documents: studentData.documents?.map(doc => ({
            id: (doc as any).id,
            name: doc.name,
            type: doc.type,
            path: doc.path,
            hasUrl: !!doc.url,
          })),
        });
      }

      // Aluno de outro tenant → cria cópia local (nunca edita o original).
      // isCrossTenant depende do tenant_id preservado no formData pelo StudentForm.
      const isCrossTenant = !!(
        editingStudent?.tenant_id &&
        user?.tenant_id &&
        editingStudent.tenant_id !== user.tenant_id
      );

      if (!(editingStudent && editingStudent.id && !isCrossTenant)) {
        if (!checkPermission('add_student')) return triggerUpgrade();
      }

      // Sprint 3 — Auto-registrar escola nova digitada pelo professor.
      // Se o schoolId do aluno não bate com nenhuma escola em memória,
      // garante que exista na tabela schools antes de salvar o aluno.
      let studentToSave = studentData;
      if (studentData.schoolName && user?.tenant_id && !isCrossTenant) {
        const alreadyLinked = user.schoolConfigs?.some(s => s.id && s.id === studentData.schoolId);
        if (!alreadyLinked) {
          const registeredSchool = await databaseService.ensureSchoolExists(
            user.tenant_id, studentData.schoolName,
          );
          if (registeredSchool?.id) {
            studentToSave = { ...studentData, schoolId: registeredSchool.id };
            if (!user.schoolConfigs?.find(s => s.id === registeredSchool.id)) {
              setUser(u => ({ ...u, schoolConfigs: [...(u.schoolConfigs ?? []), registeredSchool] }));
            }
          }
        }
      }

      const savedRow = await databaseService.saveStudent(studentToSave);
      if (import.meta.env.DEV) {
        console.info('[App.saveStudent] retorno databaseService.saveStudent', savedRow);
      }

      const fresh = await databaseService.getStudents(user.id);
      setStudents(fresh);
      const savedId = (savedRow as any)?.id ?? studentData.id;
      const refreshedStudent = fresh.find(s => s.id === savedId) ?? null;
      if (refreshedStudent) setViewingStudent(refreshedStudent);
      const alreadyImported = !!(savedRow as any)?.__alreadyImported;

      if (!DEMO_MODE && user?.id) {
        const summaryDb = await databaseService.getTenantSummary(user.id);
        setTenantSummary(summaryDb);
      }

      showToast(
        alreadyImported
          ? 'Este aluno já foi importado para sua escola. Abrindo cadastro existente.'
          : 'Aluno salvo com sucesso.',
        'success',
      );
      setEditingStudent(null);
      setView(alreadyImported && refreshedStudent ? 'student_profile' : 'students');
    } catch (e: any) {
      if (e instanceof DuplicateStudentError) {
        // Código duplicado — mostra mensagem amigável em vez do erro SQL bruto.
        // O fluxo completo de vínculo é iniciado no StudentCodeSearchModal;
        // aqui apenas orientamos o professor.
        showToast(
          `O código ${e.existingCode} já pertence a outro aluno cadastrado. ` +
          'Use "Buscar por código" para localizar e vincular o aluno à sua escola.',
          'error',
        );
        return;
      }
      console.error(e);
      showToast(e?.message || 'Erro ao salvar aluno.', 'error');
    }
  };

  // Salvar aluno vindo do EnrollmentWizard (retorna o aluno salvo para gerar PDFs)
  const saveStudentFromWizard = async (
    studentData: Partial<Student>,
    _checklist: any[],
    _analise: string,
  ): Promise<Student> => {
    if (!checkPermission('add_student')) {
      triggerUpgrade();
      throw new Error('Limite de alunos do plano atingido');
    }
    const full: Student = {
      id: '',
      schoolId: user.schoolConfigs?.[0]?.id ?? '1',
      name: '', grade: '', shift: '', regentTeacher: '', guardianName: '',
      guardianPhone: '', diagnosis: [], cid: [], supportLevel: '', medication: '',
      professionals: [], schoolHistory: '', abilities: [], difficulties: [],
      strategies: [], communication: [], observations: '',
      ...studentData,
    } as Student;
    await databaseService.saveStudent(full);
    const fresh = await databaseService.getStudents();
    setStudents(fresh);
    if (!DEMO_MODE && user?.id) {
      const summaryDb = await databaseService.getTenantSummary(user.id);
      setTenantSummary(summaryDb);
    }
    // Retorna o aluno recém-salvo (último adicionado com esse nome)
    const saved = fresh.find(s => s.name === full.name) ?? { ...full, id: 'new' };
    return saved;
  };

  const deleteStudent = async (studentId: string) => {
    if (!window.confirm('Tem certeza?')) return;
    try {
      await databaseService.deleteStudent(studentId);
      setStudents(students.filter(s => s.id !== studentId));
      setProtocols(protocols.filter(p => p.studentId !== studentId));
      if (viewingStudent?.id === studentId) {
        setViewingStudent(null);
        setView('students');
      }
      if (!DEMO_MODE && user?.id) {
        const summaryDb = await databaseService.getTenantSummary(user.id);
        setTenantSummary(summaryDb);
      }
    } catch (e: any) {
      alert(e?.message || 'Erro ao excluir aluno.');
    }
  };

  // --- Document handlers ---
  const initDocumentGeneration = (type: DocumentType) => {
    setActiveDocumentType(type);
    setCurrentProtocol(null);
  };

  const handleCreateDerivedProtocol = (sourceProtocol: Protocol, targetType: DocumentType) => {
    if (!viewingStudent) return;

    const newTempProtocol: Protocol = {
      id: 'temp',
      studentId: viewingStudent.id,
      studentName: viewingStudent.name,
      type: targetType,
      status: 'DRAFT',
      source_id: sourceProtocol.id,
      content: '',
      isStructured: true,
      structuredData: { sections: [] },
      versions: [],
      createdAt: new Date().toISOString(),
      lastEditedAt: new Date().toISOString(),
      lastEditedBy: user.name,
      generatedBy: user.name,
      auditCode: '',
      signatures: { regent: '', coordinator: '', aee: '', manager: '' },
    };

    setCurrentProtocol(newTempProtocol);
    setActiveDocumentType(targetType);

    if (targetType === DocumentType.PEI) setView('protocols');
    else if (targetType === DocumentType.PAEE) setView('paee');
    else if (targetType === DocumentType.PDI) setView('pdi');
    else setView('protocols');
  };

  const handleSaveDocument = async (
    data: DocumentData,
    student: Student,
    logMessage?: string,
    status: ProtocolStatus = 'DRAFT'
  ) => {
    const timestamp = new Date().toISOString();
    const school = user.schoolConfigs[0];
    const protocolType = currentProtocol?.type || activeDocumentType;
    const documentCode = generateAuditCode(protocolType, (data as any)?.auditCode || currentProtocol?.auditCode);
    const dataToPersist = { ...(data as any), auditCode: documentCode } as DocumentData;

    if (currentProtocol && currentProtocol.id !== 'temp') {
      const newVersion: DocumentVersion = {
        versionId: crypto.randomUUID(),
        versionNumber: currentProtocol.versions.length + 1,
        createdAt: timestamp,
        editedBy: user.name,
        content: dataToPersist,
        changeLog: logMessage || 'Edição manual',
      };

      const updatedProtocol: Protocol = {
        ...currentProtocol,
        versions: [...currentProtocol.versions, newVersion],
        structuredData: dataToPersist,
        auditCode: documentCode,
        status,
        lastEditedAt: timestamp,
        lastEditedBy: user.name,
      };

      setProtocols(prev => prev.map(p => (p.id === currentProtocol.id ? updatedProtocol : p)));
      setCurrentProtocol(updatedProtocol);

      try {
        await databaseService.saveDocument({
          ...updatedProtocol,
          tenant_id: user.tenant_id,
          structured_data: dataToPersist,
        });
      } catch (e: any) {
        console.error('[handleSaveDocument] erro ao persistir:', e);
        alert('Erro ao salvar documento no banco: ' + (e?.message ?? e));
        return;
      }
    } else {
      const newVersion: DocumentVersion = {
        versionId: crypto.randomUUID(),
        versionNumber: 1,
        createdAt: timestamp,
        editedBy: user.name,
        content: dataToPersist,
        changeLog: 'Criação inicial',
      };

      const newProtocol: Protocol = {
        id: crypto.randomUUID(),
        studentId: student.id,
        studentName: student.name,
        type: activeDocumentType,
        status,
        source_id: currentProtocol?.source_id || null,
        content: '',
        isStructured: true,
        structuredData: dataToPersist,
        versions: [newVersion],
        createdAt: timestamp,
        lastEditedAt: timestamp,
        lastEditedBy: user.name,
        generatedBy: user.name,
        auditCode: documentCode,
        signatures: {
          regent: user.name,
          coordinator: school?.coordinatorName || '',
          aee: school?.aeeRepresentative || '',
          aeeRep: school?.aeeRepName || '',
          manager: school?.managerName || '',
        },
      };

      setProtocols(prev => [newProtocol, ...prev]);
      setCurrentProtocol(newProtocol);

      try {
        const savedDoc = await databaseService.saveDocument({
          ...newProtocol,
          tenant_id: user.tenant_id,
          structured_data: dataToPersist,
        });
        // Sincroniza o ID real gerado pelo banco (evita duplicatas em novos upserts)
        if (savedDoc?.id && savedDoc.id !== newProtocol.id) {
          setProtocols(prev => prev.map(p =>
            p.id === newProtocol.id ? { ...p, id: savedDoc.id } : p
          ));
          setCurrentProtocol(prev => prev ? { ...prev, id: savedDoc.id } : prev);
        }
      } catch (e: any) {
        console.error('[handleSaveDocument] erro ao persistir:', e);
        alert('Erro ao salvar documento no banco: ' + (e?.message ?? e));
        return;
      }
    }
  };

  const handleDeleteDocument = (protocolId: string) => {
    setProtocols(prev => prev.filter(p => p.id !== protocolId));
    setCurrentProtocol(null);
    setView(viewingStudent ? 'student_profile' : 'dashboard');
  };

  const handleGenerateAI = async (student: Student) => {
    if (!checkPermission('ai_gen')) return triggerUpgrade();
    if (!student) return alert('Erro: Aluno não identificado.');

    setGenerating(true);

    const laudoDoc = student?.documents?.find(d => d.type === 'Laudo' && d.url?.startsWith('data:'));
    const docContent = laudoDoc ? laudoDoc.url : undefined;

    let studentContext: StudentContext | undefined;
    if (student.id) {
      try {
        studentContext = await StudentContextService.buildContext(student.id);
      } catch { /* contexto é opcional — falha silenciosa */ }
    }

    try {
      const { generateProtocolAI } = await import('./services/geminiService');
      const jsonString = await generateProtocolAI(activeDocumentType, student, user, docContent, studentContext);
      let structuredData: DocumentData;
      try {
        const cleanJson = jsonString.replace(/```json/g, '').replace(/```/g, '');
        structuredData = JSON.parse(cleanJson);
      } catch {
        structuredData = { sections: [] };
        alert('Erro ao estruturar dados da IA. Usando template vazio.');
      }

      setCurrentProtocol({
        id: 'temp',
        studentId: student.id,
        studentName: student.name,
        type: activeDocumentType,
        status: 'DRAFT',
        content: '',
        isStructured: true,
        structuredData,
        versions: [],
        createdAt: '',
        lastEditedAt: '',
        lastEditedBy: '',
        generatedBy: '',
        auditCode: '',
        signatures: { regent: '', coordinator: '', aee: '', manager: '' },
      });
    } catch (e: any) {
      alert(e?.message || 'Erro ao gerar protocolo.');
    } finally {
      setGenerating(false);
      // Refresh créditos após geração de IA
      if (!DEMO_MODE && user?.id) {
        try {
          const summaryDb = await databaseService.getTenantSummary(user.id);
          setTenantSummary(summaryDb);
        } catch {}
      }
    }
  };

  // --- Navegação com inicialização de documento ---
  const handleSetView = (v: string) => {
    const docMap: Record<string, DocumentType> = {
      protocols: DocumentType.PEI,
      pdi: DocumentType.PDI,
      paee: DocumentType.PAEE,
      estudo_caso: DocumentType.ESTUDO_CASO,
    };
    if (docMap[v]) {
      initDocumentGeneration(docMap[v]);
    }
    setEditingStudent(null);
    setView(v);
    if (window.innerWidth < 1024) setIsSidebarOpen(false);
  };

  // --- Telas sem auth ---
  if (view === 'audit') {
    const handleValidate = async () => {
      const code = auditSearch.trim().toUpperCase();
      if (!code) return;
      if (!code.startsWith('VAL-')) {
        setAuditResult({ found: false });
        return;
      }
      setAuditLoading(true);
      setAuditResult(null);
      try {
        const { data, error } = await supabase.rpc('validate_document_public', { p_code: code });
        if (error) throw error;
        if (data && data.length > 0) {
          const row = data[0];
          setAuditResult({
            found: true,
            type: row.document_type,
            studentName: row.student_name,
            issuedAt: row.issued_at,
            code: row.audit_code,
          });
        } else {
          setAuditResult({ found: false });
        }
      } catch {
        setAuditResult({ found: false });
      } finally {
        setAuditLoading(false);
      }
    };

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-xl w-full bg-white p-8 rounded-2xl shadow-xl text-center">
          <ShieldCheck className="mx-auto text-brand-600 h-16 w-16 mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Validação Pública</h2>
          <p className="text-gray-500 text-sm mb-6">Digite o código de validação impresso no documento.</p>
          <input
            className="w-full text-center text-lg p-4 border border-gray-300 rounded-lg mb-4 uppercase tracking-widest font-mono"
            placeholder="Ex: VAL-20260505-143522-B8K2"
            value={auditSearch}
            onChange={e => { setAuditSearch(e.target.value); setAuditResult(null); }}
            onKeyDown={e => { if (e.key === 'Enter') handleValidate(); }}
          />
          <button
            className="w-full bg-brand-600 text-white py-3 rounded-lg font-bold disabled:opacity-50"
            onClick={handleValidate}
            disabled={auditLoading || !auditSearch.trim()}
          >
            {auditLoading ? 'Verificando...' : 'Verificar Autenticidade'}
          </button>

          {auditResult && auditResult.found && (
            <div className="mt-6 bg-green-50 border border-green-300 rounded-xl p-5 text-left">
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck className="text-green-600 h-6 w-6" />
                <span className="text-green-700 font-bold text-lg">Documento VÁLIDO</span>
              </div>
              <div className="space-y-1 text-sm text-gray-700">
                <p><span className="font-semibold">Tipo:</span> {auditResult.type}</p>
                <p><span className="font-semibold">Aluno:</span> {auditResult.studentName}</p>
                <p><span className="font-semibold">Emitido em:</span> {auditResult.issuedAt ? new Date(auditResult.issuedAt).toLocaleDateString('pt-BR') : '—'}</p>
                <p><span className="font-semibold">Código:</span> <span className="font-mono">{auditResult.code}</span></p>
                <p><span className="font-semibold">Autenticidade:</span> <span className="text-green-600 font-semibold">CONFIRMADA ✓</span></p>
              </div>
            </div>
          )}

          {auditResult && !auditResult.found && (
            <div className="mt-6 bg-red-50 border border-red-300 rounded-xl p-5 text-left">
              <div className="flex items-center gap-2">
                <span className="text-red-600 text-xl">✕</span>
                <span className="text-red-700 font-bold text-lg">Documento não encontrado</span>
              </div>
              <p className="text-sm text-gray-600 mt-2">O código informado não corresponde a nenhum documento registrado. Verifique se digitou corretamente.</p>
            </div>
          )}

          <button onClick={() => { setView('landing'); setAuditResult(null); setAuditSearch(''); }} className="mt-6 text-gray-500 hover:text-gray-800 text-sm">
            Voltar
          </button>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    const pendingPlanLabel = (() => {
      const code = localStorage.getItem(PENDING_PLAN_KEY);
      if (code === 'PRO') return 'Pro';
      if (code === 'MASTER') return 'Premium';
      return undefined;
    })();

    if (view === 'activation')
      return (
        <ActivationView
          initialEmail={activationEmail || undefined}
          onActivated={(_planCode) => {
            // Novo usuário: vai para login para carregar o perfil completo
            setView('login');
          }}
          onBack={() => setView('landing')}
        />
      );

    if (view === 'forgot_password')
      return (
        <React.Suspense fallback={<PageLoader />}>
          <ForgotPasswordView onBack={() => setView('login')} />
        </React.Suspense>
      );

    if (view === 'login')
      return (
        <React.Suspense fallback={<PageLoader />}>
          <LoginScreen
            onLogin={handleLogin}
            onRegister={handleRegister}
            onGoogleLogin={handleGoogleLogin}
            pendingPlanLabel={pendingPlanLabel}
            initialTab={loginInitialTab}
            onForgotPassword={() => setView('forgot_password')}
          />
        </React.Suspense>
      );
    return (
      <>
        <React.Suspense fallback={<PageLoader />}>
          <LandingPage
            onLogin={() => {
              window.history.pushState({ view: 'login', tab: 'login' }, '', '/login');
              setLoginInitialTab('login');
              setView('login');
            }}
            onRegister={() => {
              window.history.pushState({ view: 'login', tab: 'register' }, '', '/cadastro?plan=free');
              setLoginInitialTab('register');
              setView('login');
            }}
            onAudit={() => setView('audit')}
            onUpgradeClick={handleUpgradeClick}
          />
        </React.Suspense>
        <WhatsAppFloatButton />
      </>
    );
  }

  // ── Troca de senha obrigatória — bloqueia acesso ao sistema ─────────────
  if (view === 'force_change_password') {
    return (
      <React.Suspense fallback={<PageLoader />}>
        <ForceChangePasswordView
          userId={user.id}
          userEmail={user.email}
          onPasswordChanged={() => {
            setUser(prev => ({ ...prev, must_change_password: false }));
            setView('dashboard');
          }}
        />
      </React.Suspense>
    );
  }

  // ── Recuperação de senha self-service (acessível pré-login) ──────────────
  if (view === 'forgot_password') {
    return (
      <React.Suspense fallback={<PageLoader />}>
        <ForgotPasswordView onBack={() => setView('login')} />
      </React.Suspense>
    );
  }

  // ── Ativação pós-pagamento para usuário já autenticado ────────────────────
  // Quando ?activate=1 chega com sessão ativa, o bloco !isAuthenticated não
  // renderiza o ActivationView. Tratamos aqui para não perder a ativação.
  if (view === 'activation') {
    return (
      <ActivationView
        initialEmail={activationEmail || user.email || undefined}
        authenticatedEmail={user.email || undefined}
        onActivated={async (_planCode) => {
          // Recarrega perfil para refletir novo plano/créditos no dashboard
          try {
            const refreshed = await databaseService.getUserProfile(user.id);
            if (refreshed) setUser(refreshed);
            const summary = await databaseService.getTenantSummary(user.id);
            if (summary) setTenantSummary(summary);
          } catch (e) {
            console.warn('[App] Falha ao recarregar perfil após ativação:', e);
          }
          setView('dashboard');
        }}
        onBack={() => setView('dashboard')}
      />
    );
  }

  // ── CEO panel: layout independente, fullscreen real ──────────────────────
  // Deve ficar ANTES do return do layout comum para não herdar sidebar/header/main.
  if (view === 'admin') {
    return (
      <ErrorBoundary>
        {showLGPD && <LGPDModal onAccept={handleLGPDAccept} />}
        <React.Suspense fallback={<PageLoader />}>
          <AdminDashboard user={user} onLogout={handleLogout} />
        </React.Suspense>
      </ErrorBoundary>
    );
  }
  // ──────────────────────────────────────────────────────────────────────────

  const isDocView = ['protocols', 'pdi', 'paee', 'estudo_caso'].includes(view);

  return (
    <ErrorBoundary>
      {showLGPD && <LGPDModal onAccept={handleLGPDAccept} />}

      <div className={`${view === 'incluilab' || view === 'incluilab_library' ? 'h-screen overflow-hidden' : 'min-h-screen'} flex bg-[#f8fafc] font-sans print:bg-white relative`}>
        {isSidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-30 lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        <Sidebar
          user={user}
          currentView={view}
          hasFinalCaseStudy={protocols.some(
            p => p.type === DocumentType.ESTUDO_CASO && p.status === 'FINAL'
          )}
          setView={handleSetView}
          isOpen={isSidebarOpen}
          onLogout={handleLogout}
          studentCount={students.length}
          protocolCount={protocols.length}
          planMaxStudents={planMaxStudents}
          triagemCount={students.filter(s => s.tipo_aluno === 'em_triagem').length}
          unreadMessages={unreadMessages}
        />

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {(() => {
            const resolvedStatus = (activeSubscription?.status ?? user.subscriptionStatus) as SubscriptionStatus;
            const showBanner =
              isAuthenticated &&
              !user.isAdmin &&
              !activeSubscription?.isTestAccount &&
              shouldShowExpiredBanner(resolvedStatus);
            return showBanner ? (
              <ExpiredPlanBanner
                subscriptionStatus={resolvedStatus}
                tenantSummary={tenantSummary}
                user={user}
                subscription={activeSubscription}
              />
            ) : null;
          })()}

          <header
            className="border-b border-gray-200 h-16 flex items-center px-4 justify-between shrink-0 print:hidden"
            style={{ background: '#1F4E5F' }}
          >
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="p-2 text-white/70 hover:bg-white/10 rounded-lg transition"
              >
                <Menu size={24} color="white" />
              </button>
              <BrandLogo fontSize={16} iconSize={14} className="lg:hidden" />
            </div>
            {isAuthenticated && (
              <NotificationsPanel
                onNavigate={handleSetView}
                refreshTrigger={unreadMessages}
              />
            )}
          </header>

          <main className={view === 'incluilab' || view === 'incluilab_library' ? 'flex-1 overflow-hidden flex flex-col min-h-0' : 'flex-1 overflow-y-auto'}>
            {/* Banner de configuração da escola — exibe apenas em Configurações */}
            {!user.isAdmin && view === 'settings' && (
              <SchoolSetupBanner
                school={user.schoolConfigs?.[0]}
                onGoToSettings={() => handleSetView('settings')}
              />
            )}

            {/* Banner: cadastro incompleto (sem phone/cpf) — discreto, não bloqueia */}
            {showContactBanner && !showContactModal && (
              <ContactDataBanner
                onUpdate={() => setShowContactModal(true)}
                onDismiss={() => setShowContactBanner(false)}
              />
            )}

            {/* Modal de atualização de telefone/CPF */}
            {showContactModal && (
              <ContactDataModal
                userId={user.id}
                onSave={async (phone, cpf) => {
                  await supabase.from('users').update({ phone, cpf }).eq('id', user.id);
                  setUser(prev => ({ ...prev, phone, cpf }));
                  setShowContactModal(false);
                  setShowContactBanner(false);
                }}
                onClose={() => setShowContactModal(false)}
              />
            )}

            <React.Suspense fallback={<PageLoader />}>
            <div className={view === 'incluilab' || view === 'incluilab_library' ? 'flex-1 min-h-0 overflow-hidden' : 'p-4 lg:p-8'}>
            {view === 'dashboard' && (
              <DashboardView
                userName={user.name}
                students={students}
                protocols={protocols}
                appointments={appointments}
                planMaxStudents={planMaxStudents}
                planMaxStudentsLabel={planMaxStudentsLabel}
                planMonthlyCredits={planMonthlyCredits}
                creditsAvailable={creditsAvailable}
                creditsPurchased={creditsPurchased}
                creditsConsumedCycle={creditsConsumedCycle}
                creditsResetAt={creditsResetAt}
                planName={planDisplayName}
                subscriptionExpiry={activeSubscription?.currentPeriodEnd ?? tenantSummary?.renewalDatePlan ?? null}
                userId={user.id}
                onNavigate={handleSetView}
                schoolName={user.schoolConfigs?.[0]?.schoolName}
              />
            )}

            {view === 'student_profile' && viewingStudent && (
              <StudentProfile
                student={viewingStudent}
                protocols={protocols}
                onBack={() => setView('students')}
                onEdit={() => {
                  setEditingStudent(viewingStudent);
                  setView('students');
                }}
                onViewProtocol={p => {
                  setCurrentProtocol(p);
                  setActiveDocumentType(p.type);
                  // Mapeia o tipo de documento para a view correta (destaca item certo na sidebar)
                  const docViewMap: Record<string, string> = {
                    [DocumentType.PEI]:          'protocols',
                    [DocumentType.PAEE]:         'paee',
                    [DocumentType.PDI]:          'pdi',
                    [DocumentType.ESTUDO_CASO]:  'estudo_caso',
                  };
                  setView(docViewMap[p.type] ?? 'protocols');
                }}
                onCreateDerived={handleCreateDerivedProtocol}
                userPlan={user.plan}
                user={user}
                serviceRecords={serviceRecords.filter(r => r.studentId === viewingStudent.id)}
                appointments={appointments}
                onAddServiceRecord={() => {}}
                onRefreshProtocols={async () => {
                  try {
                    const fresh = await databaseService.getProtocols(user.id);
                    setProtocols(fresh);
                  } catch (e) { console.error('[refresh protocols]', e); }
                }}
                onUpdateStudent={updatedStudent => {
                  setStudents(prev => prev.map(s => s.id === updatedStudent.id ? updatedStudent : s));
                }}
                onNavigateTo={handleSetView}
              />
            )}

            {view === 'appointments' && (
              <AppointmentsView
                students={students}
                user={user}
                appointments={appointments}
                onAddAppointment={async apt => {
                  setAppointments(prev => [apt, ...prev]);
                  AppointmentService.save(apt, user.id).catch(e =>
                    console.error('[Appointment] save error:', e)
                  );
                }}
                onUpdateAppointment={async apt => {
                  setAppointments(prev => prev.map(a => a.id === apt.id ? apt : a));
                  AppointmentService.save(apt, user.id).catch(e =>
                    console.error('[Appointment] update error:', e)
                  );
                }}
                onDeleteAppointment={async id => {
                  setAppointments(prev => prev.filter(a => a.id !== id));
                  AppointmentService.delete(id).catch(e =>
                    console.error('[Appointment] delete error:', e)
                  );
                }}
              />
            )}

            {view === 'triagem' && (
              <TriagemView
                students={students}
                user={user}
                onOpenStudent={handleSelectStudent}
                onStartEnrollment={() => {
                  setEnrollmentTipo('em_triagem');
                  setShowEnrollmentWizard(true);
                }}
                onOpenEstudoCaso={s => {
                  setViewingStudent(s);
                  setActiveDocumentType(DocumentType.ESTUDO_CASO);
                  setView('estudo_caso');
                }}
                onConvertToLaudo={s => {
                  const updated = { ...s, tipo_aluno: 'com_laudo' as const };
                  saveStudent(updated);
                }}
              />
            )}

            {view === 'students' &&
              (!editingStudent ? (
                <StudentsListView
                  students={students}
                  planMaxStudents={planMaxStudents}
                  userPlan={user.plan}
                  user={user}
                  onSelect={handleSelectStudent}
                  onEdit={s => setEditingStudent(s)}
                  onDelete={deleteStudent}
                  onCreateTriagem={() => { const s = {} as any; s.tipo_aluno = 'em_triagem'; setEditingStudent(s); }}
                  onCreateComLaudo={() => { const s = {} as any; s.tipo_aluno = 'com_laudo'; setEditingStudent(s); }}
                  onStudentImported={(_studentId, protocolCode) => {
                    if (protocolCode) {
                      showToast(`Aluno adicionado à sua escola. Protocolo: ${protocolCode}`);
                    } else {
                      showToast('Aluno já vinculado à sua escola.');
                    }
                    // Recarrega lista para incluir o aluno recém-vinculado
                    databaseService.getStudents(user.id).then(s => setStudents(s)).catch(() => {});
                  }}
                  onImportStudents={(importedCount) => {
                    // Recarrega lista completa após importação CSV
                    databaseService.getStudents(user.id).then(s => setStudents(s)).catch(() => {});
                    // Atualiza resumo do tenant (contagem de alunos no plano)
                    if (!DEMO_MODE) {
                      databaseService.getTenantSummary(user.id).then(s => setTenantSummary(s)).catch(() => {});
                    }
                  }}
                />
              ) : (
                <StudentForm
                  initialData={editingStudent}
                  onSave={saveStudent}
                  onCancel={() => setEditingStudent(null)}
                  regentName={user.name}
                  availableSchools={user.schoolConfigs}
                  userPlan={user.plan}
                  tenantId={user.tenant_id}
                />
              ))}

            {isDocView && (
              <div className="max-w-4xl mx-auto">
                <DocumentBuilder
                  type={activeDocumentType}
                  initialStudent={viewingStudent}
                  allStudents={students}
                  protocols={protocols}
                  user={user}
                  initialProtocol={currentProtocol}
                  initialData={currentProtocol?.structuredData}
                  onSave={handleSaveDocument}
                  onDelete={handleDeleteDocument}
                  onCancel={() => {
                    setCurrentProtocol(null);
                    setView('dashboard');
                  }}
                  onGenerateAI={handleGenerateAI}
                  onDerive={handleCreateDerivedProtocol}
                  isGenerating={generating}
                />
              </div>
            )}

            {view === 'reports' && (
              <ReportsView
                students={students}
                onUpdateStudent={updatedStudent => {
                  setStudents(prev => prev.map(s => s.id === updatedStudent.id ? updatedStudent : s));
                }}
                currentUser={user}
                currentPlan={user?.plan ?? PlanTier.FREE}
              />
            )}

            {view === 'documents' && (
              <DocumentsHistoryView
                protocols={protocols}
                students={students}
                onOpen={p => {
                  setCurrentProtocol(p);
                  setActiveDocumentType(p.type);
                  const docViewMap: Record<string, string> = {
                    [DocumentType.PEI]:          'protocols',
                    [DocumentType.PAEE]:         'paee',
                    [DocumentType.PDI]:          'pdi',
                    [DocumentType.ESTUDO_CASO]:  'estudo_caso',
                  };
                  setView(docViewMap[p.type] ?? 'protocols');
                }}
              />
            )}

            {(view === 'settings' || view === 'referrals') && (
              <SettingsView
                user={user}
                onUpdateUser={setUser}
                onFinishSetup={() => setView('dashboard')}
                initialTab={view === 'referrals' ? 'finance' : undefined}
              />
            )}

            {view === 'school_templates' && (
              <SchoolTemplatesView
                user={user}
                tenantSummary={tenantSummary}
              />
            )}

            {view === 'printable_templates' && (
              <PrintableTemplatesView user={user} />
            )}

            {view === 'fichas' && (
              <FichasComplementaresView
                students={students}
                user={user}
              />
            )}

            {view === 'fichas_historicos' && (
              <FichasHistoricosView user={user} />
            )}

            {view === 'service_control' && (
              <ServiceControlView
                user={user}
                students={students}
                serviceRecords={serviceRecords}
                onAddRecord={async record => {
                  setServiceRecords(prev => [record, ...prev]);
                  if (user.tenant_id) {
                    ServiceRecordService.save(record, user.tenant_id).catch(e =>
                      console.error('[ServiceRecord] save error:', e)
                    );
                  }
                }}
                onUpdateRecord={async record => {
                  setServiceRecords(prev => prev.map(r => r.id === record.id ? record : r));
                  if (user.tenant_id) {
                    ServiceRecordService.save(record, user.tenant_id).catch(e =>
                      console.error('[ServiceRecord] update error:', e)
                    );
                  }
                }}
                onDeleteRecord={async id => {
                  setServiceRecords(prev => prev.filter(r => r.id !== id));
                  ServiceRecordService.delete(id).catch(e =>
                    console.error('[ServiceRecord] delete error:', e)
                  );
                }}
              />
            )}

            {view === 'subscription' && (
              <SubscriptionView
                user={user}
                creditsAvailable={creditsAvailable}
                planCreditsMonthly={planMonthlyCredits}
                creditsPurchased={creditsPurchased}
                creditsConsumed={creditsConsumedCycle}
                onNavigate={setView}
              />
            )}

            {view === 'incluilab' && (
              <IncluiLabView
                user={user}
                students={students}
                creditsAvailable={creditsAvailable}
                creditsUsed={creditsConsumedCycle}
                creditsTotal={planMonthlyCredits + creditsPurchased}
                onNavigate={handleSetView}
              />
            )}

            {view === 'incluilab_library' && (
              <IncluiLabView
                user={user}
                students={students}
                defaultTab="library"
                creditsAvailable={creditsAvailable}
                creditsUsed={creditsConsumedCycle}
                creditsTotal={planMonthlyCredits + creditsPurchased}
                onNavigate={handleSetView}
              />
            )}

            {view === 'messages' && (
              <MessagesView onNavigate={handleSetView} />
            )}

            {view === 'help_center' && (
              <HelpCenterView onNavigate={handleSetView} />
            )}
            </div>{/* /p-4 lg:p-8 */}
            </React.Suspense>
          </main>
        </div>
      </div>

      {/* ── Enrollment Wizard — modal global ── */}
      {showEnrollmentWizard && (
        <React.Suspense fallback={null}>
          <EnrollmentWizard
            user={user}
            initialTipo={enrollmentTipo}
            onSave={saveStudentFromWizard}
            onClose={() => setShowEnrollmentWizard(false)}
          />
        </React.Suspense>
      )}

      {/* WhatsApp Float Button — persistente em todas as telas autenticadas */}
      <WhatsAppFloatButton />

      {/* Toast inline — substitui alert() para eventos de vínculo e erros de aluno */}
      {toastMsg && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3
                     px-5 py-3 rounded-2xl shadow-xl text-sm font-semibold text-white
                     animate-fade-in-up max-w-md w-[calc(100%-2rem)]"
          style={{
            background: toastMsg.type === 'success' ? '#1F4E5F' : '#DC2626',
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          }}
        >
          {toastMsg.type === 'success'
            ? <CheckCircle2 size={18} className="shrink-0" />
            : <AlertCircle  size={18} className="shrink-0" />}
          <span className="flex-1">{toastMsg.text}</span>
          <button
            onClick={() => setToastMsg(null)}
            className="opacity-70 hover:opacity-100 transition-opacity ml-2"
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </ErrorBoundary>
  );
};

export default App;
