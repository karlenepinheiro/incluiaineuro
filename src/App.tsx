import React, { useMemo, useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { LoginScreen } from './components/LoginScreen';
import { DashboardView } from './views/DashboardView';
import { LandingPage } from './views/LandingPage';
import { StudentForm } from './components/StudentForm';
import { SettingsView } from './views/SettingsView';
import { StudentProfile } from './components/StudentProfile';
import { generateProtocolAI } from './services/geminiService';
import { StudentContextService } from './services/studentContextService';
import type { StudentContext } from './services/studentContextService';
import {
  PlanTier,
  UserRole,
  DocumentType,
  Student,
  Protocol,
  User,
  SchoolConfig,
  DocumentData,
  getPlanLimits,
  DocumentVersion,
  SubscriptionStatus,
  TenantType,
  ProtocolStatus,
  ServiceRecord,
} from './types';
import { ShieldCheck, Menu } from 'lucide-react';
import { DocumentBuilder } from './components/DocumentBuilder';
import { AdminDashboard } from './views/AdminDashboard';
import { StudentsListView } from './views/StudentsListView';
import { ReportsView } from './views/ReportsView';
import { SchoolTemplatesView } from './views/SchoolTemplatesView';
import { ReferralService } from './services/referralService';
import { FichasComplementaresView } from './views/FichasComplementaresView';
import { TriagemView } from './views/TriagemView';
import { ServiceControlView } from './views/ServiceControlView';
import { SubscriptionView } from './views/SubscriptionView';
import { EnrollmentWizard } from './components/EnrollmentWizard';
import { IncluiLabView } from './views/IncluiLabView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LGPDModal } from './components/LGPDModal';
import { ExpiredPlanBanner } from './components/ExpiredPlanBanner';
import { PaymentService } from './services/paymentService';
import { shouldShowExpiredBanner, getActiveSubscription, type ActiveSubscriptionInfo } from './services/subscriptionService';
import { getSubscriptionCheckoutUrl } from './services/kiwifyService';
import { supabase, DEMO_MODE } from './services/supabase';
import { databaseService } from './services/databaseService';
import { ServiceRecordService } from './services/persistenceService';

// --- Helper ---
const generateAuditCode = (userName: string) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let random = '';
  for (let i = 0; i < 8; i++) random += chars.charAt(Math.floor(Math.random() * chars.length));
  const now = new Date();
  return `${random}-${userName.split(' ')[0].toUpperCase()}-${now
    .toLocaleDateString('pt-BR')
    .replace(/\//g, '')}`;
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
  const [view, setView] = useState('landing');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const [user, setUser] = useState<User>(MOCK_USER);
  const [students, setStudents] = useState<Student[]>([]);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [serviceRecords, setServiceRecords] = useState<ServiceRecord[]>([]);

  const [viewingStudent, setViewingStudent] = useState<Student | null>(null);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [showEnrollmentWizard, setShowEnrollmentWizard] = useState(false);
  const [enrollmentTipo, setEnrollmentTipo] = useState<'em_triagem' | 'com_laudo'>('em_triagem');

  const [generating, setGenerating] = useState(false);
  const [currentProtocol, setCurrentProtocol] = useState<Protocol | null>(null);
  const [activeDocumentType, setActiveDocumentType] = useState<DocumentType>(DocumentType.PEI);

  const [auditSearch, setAuditSearch] = useState('');
  const [auditResult, setAuditResult] = useState<{ found: boolean; type?: string; studentName?: string; issuedAt?: string; code?: string } | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [showLGPD, setShowLGPD] = useState(false);

  const [tenantSummary, setTenantSummary] = useState<any | null>(null);
  const [effectivePlans, setEffectivePlans] = useState<any[]>([]);
  const [activeSubscription, setActiveSubscription] = useState<ActiveSubscriptionInfo | null>(null);

  const planName = useMemo(() => {
    if (user.plan === PlanTier.PREMIUM) return 'MASTER';
    if (user.plan === PlanTier.PRO) return 'PRO';
    if (user.plan === PlanTier.FREE) return 'FREE';
    return 'FREE';
  }, [user.plan]);

  const planEff = useMemo(() => {
    const found = effectivePlans.find((p: any) => String(p?.name ?? '').toUpperCase() === planName);
    return found ?? null;
  }, [effectivePlans, planName]);

  const planMaxStudents = useMemo(() => {
    const fromPlanEff = Number(planEff?.max_students);
    if (Number.isFinite(fromPlanEff) && fromPlanEff > 0) return fromPlanEff;
    const fromSummary = Number(tenantSummary?.studentLimitBase);
    if (Number.isFinite(fromSummary) && fromSummary > 0) return fromSummary;
    const fromStatic = (getPlanLimits(user.plan) as any)?.students;
    if (typeof fromStatic === 'number' && fromStatic > 0) return fromStatic;
    return 0;
  }, [planEff?.max_students, tenantSummary?.studentLimitBase, user.plan]);

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
    const planDefault = planMonthlyCredits > 0 ? planMonthlyCredits : (getPlanLimits(user.plan) as any).ai_credits ?? 0;
    // Enquanto tenantSummary não carregou, usa créditos do plano como fallback
    if (tenantSummary === null) return planDefault;
    // Calcula saldo pelo ledger: plano + comprados − consumidos
    // Garante: 70 − 13 = 57 (e não o saldo da carteira que pode estar desatualizado)
    const consumed  = Math.max(0, Number(tenantSummary?.creditsConsumedCycle ?? 0));
    const purchased = Math.max(0, Number(tenantSummary?.creditsPurchased    ?? 0));
    return Math.max(0, planDefault + purchased - consumed);
  }, [tenantSummary, planMonthlyCredits, user.plan]);

  // Créditos comprados e consumidos (do ledger, via tenantSummary)
  const creditsPurchased = useMemo(() => Number(tenantSummary?.creditsPurchased ?? 0), [tenantSummary?.creditsPurchased]);
  const creditsConsumedCycle = useMemo(() => Number(tenantSummary?.creditsConsumedCycle ?? 0), [tenantSummary?.creditsConsumedCycle]);

  const creditsResetAt = useMemo(() => {
    return (tenantSummary?.renewalDateCredits ?? null) as string | null;
  }, [tenantSummary?.renewalDateCredits]);

  // --- Captura ?ref= da URL para sistema de indicacao ---
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) ReferralService.saveRefToStorage(ref);
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
    const needsLGPD = !profile.lgpdConsent?.accepted;
    const needsSchoolSetup =
      !profile.schoolConfigs ||
      profile.schoolConfigs.length === 0 ||
      !(profile.schoolConfigs[0] as any)?.schoolName?.trim();

    if (needsLGPD) setShowLGPD(true);

    setUser(profile);
    setIsAuthenticated(true);
    const isCeo = profile.isAdmin || String(profile.role ?? '').toUpperCase() === 'CEO';
    setView(isCeo ? 'admin' : needsLGPD || needsSchoolSetup ? 'settings' : 'dashboard');

    const [studentsDb, protocolsDb, summaryDb, plansDb, subInfo, serviceRecordsDb] = await Promise.all([
      databaseService.getStudents(profile.id),
      databaseService.getProtocols(profile.id),
      databaseService.getTenantSummary(profile.id),
      databaseService.getEffectivePlans(),
      profile.tenant_id ? getActiveSubscription(profile.tenant_id) : Promise.resolve(null),
      profile.tenant_id ? ServiceRecordService.list(profile.tenant_id) : Promise.resolve([]),
    ]);

    setStudents(studentsDb);
    setProtocols(protocolsDb);
    setTenantSummary(summaryDb);
    setEffectivePlans(plansDb);
    setActiveSubscription(subInfo);
    setServiceRecords(serviceRecordsDb);
    if (subInfo?.status) {
      setUser(prev => ({ ...prev, subscriptionStatus: subInfo.status }));
    }

    // Referral pendente
    const pendingRef = ReferralService.getRefFromStorage();
    if (pendingRef && profile.id) {
      ReferralService.registerReferral(profile.id, pendingRef).catch(() => {});
    }

    // Upgrade pendente — redireciona para Kiwify com tenantId injetado
    const pendingPlan = localStorage.getItem(PENDING_PLAN_KEY) as 'PRO' | 'MASTER' | null;
    if (pendingPlan && profile.tenant_id) {
      localStorage.removeItem(PENDING_PLAN_KEY);
      try {
        const url = await getSubscriptionCheckoutUrl(pendingPlan, profile.tenant_id);
        if (url && url !== '#') window.open(url, '_blank');
      } catch { /* silencioso — usuário já está logado */ }
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
  const handleRegister = async (name: string, email: string, pass: string) => {
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
    setView('login');
  };

  const handleLGPDAccept = async () => {
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
      if (editingStudent && editingStudent.id) {
        await databaseService.saveStudent(studentData);
        setStudents(students.map(s => (s.id === studentData.id ? studentData : s)));
        setViewingStudent(studentData);
      } else {
        if (!checkPermission('add_student')) return triggerUpgrade();
        await databaseService.saveStudent(studentData);
        const fresh = await databaseService.getStudents();
        setStudents(fresh);
      }

      if (!DEMO_MODE && user?.id) {
        const summaryDb = await databaseService.getTenantSummary(user.id);
        setTenantSummary(summaryDb);
      }

      setEditingStudent(null);
      setView('students');
    } catch (e: any) {
      console.error(e);
      alert(e?.message || 'Erro ao salvar aluno.');
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

    if (currentProtocol && currentProtocol.id !== 'temp') {
      const newVersion: DocumentVersion = {
        versionId: crypto.randomUUID(),
        versionNumber: currentProtocol.versions.length + 1,
        createdAt: timestamp,
        editedBy: user.name,
        content: data,
        changeLog: logMessage || 'Edição manual',
      };

      const updatedProtocol: Protocol = {
        ...currentProtocol,
        versions: [...currentProtocol.versions, newVersion],
        structuredData: data,
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
          structured_data: data,
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
        content: data,
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
        structuredData: data,
        versions: [newVersion],
        createdAt: timestamp,
        lastEditedAt: timestamp,
        lastEditedBy: user.name,
        generatedBy: user.name,
        auditCode: generateAuditCode(user.name),
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
          structured_data: data,
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
          <p className="text-gray-500 text-sm mb-6">Digite o código de autenticidade impresso no documento.</p>
          <input
            className="w-full text-center text-lg p-4 border border-gray-300 rounded-lg mb-4 uppercase tracking-widest font-mono"
            placeholder="Ex: AB3C1D2E-NOME-26032026"
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

    if (view === 'login')
      return (
        <LoginScreen
          onLogin={handleLogin}
          onRegister={handleRegister}
          onGoogleLogin={handleGoogleLogin}
          pendingPlanLabel={pendingPlanLabel}
        />
      );
    return (
      <LandingPage
        onLogin={() => setView('login')}
        onRegister={() => setView('login')}
        onAudit={() => setView('audit')}
        onUpgradeClick={handleUpgradeClick}
      />
    );
  }

  // ── CEO panel: layout independente, fullscreen real ──────────────────────
  // Deve ficar ANTES do return do layout comum para não herdar sidebar/header/main.
  if (view === 'admin') {
    return (
      <ErrorBoundary>
        {showLGPD && <LGPDModal onAccept={handleLGPDAccept} />}
        <AdminDashboard user={user} onLogout={handleLogout} />
      </ErrorBoundary>
    );
  }
  // ──────────────────────────────────────────────────────────────────────────

  const isDocView = ['protocols', 'pdi', 'paee', 'estudo_caso'].includes(view);

  return (
    <ErrorBoundary>
      {showLGPD && <LGPDModal onAccept={handleLGPDAccept} />}

      <div className="min-h-screen flex bg-[#f8fafc] font-sans print:bg-white relative">
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

          <header className="bg-white border-b border-gray-200 h-16 flex items-center px-4 justify-between shrink-0 print:hidden">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition"
              >
                <Menu size={24} />
              </button>
              <span className="font-bold text-gray-700 lg:hidden">IncluiAI</span>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto p-4 lg:p-8">
            {view === 'dashboard' && (
              <DashboardView
                userName={user.name}
                students={students}
                protocols={protocols}
                appointments={[]}
                planMaxStudents={planMaxStudents}
                planMonthlyCredits={planMonthlyCredits}
                creditsAvailable={creditsAvailable}
                creditsPurchased={creditsPurchased}
                creditsConsumedCycle={creditsConsumedCycle}
                creditsResetAt={creditsResetAt}
                planName={planName}
                subscriptionExpiry={activeSubscription?.currentPeriodEnd ?? tenantSummary?.renewalDatePlan ?? null}
                userId={user.id}
                onNavigate={setView}
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
                serviceRecords={[]}
                onAddServiceRecord={() => {}}
                onUpdateStudent={updatedStudent => {
                  setStudents(prev => prev.map(s => s.id === updatedStudent.id ? updatedStudent : s));
                }}
                onNavigateTo={handleSetView}
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
                  onSelect={handleSelectStudent}
                  onEdit={s => setEditingStudent(s)}
                  onDelete={deleteStudent}
                  onCreateTriagem={() => { const s = {} as any; s.tipo_aluno = 'em_triagem'; setEditingStudent(s); }}
                  onCreateComLaudo={() => { const s = {} as any; s.tipo_aluno = 'com_laudo'; setEditingStudent(s); }}
                />
              ) : (
                <StudentForm
                  initialData={editingStudent}
                  onSave={saveStudent}
                  onCancel={() => setEditingStudent(null)}
                  regentName={user.name}
                  availableSchools={user.schoolConfigs}
                  userPlan={user.plan}
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

            {view === 'fichas' && (
              <FichasComplementaresView
                students={students}
                user={user}
              />
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
                sidebarOpen={isSidebarOpen}
              />
            )}
          </main>
        </div>
      </div>

      {/* ── Enrollment Wizard — modal global ── */}
      {showEnrollmentWizard && (
        <EnrollmentWizard
          user={user}
          initialTipo={enrollmentTipo}
          onSave={saveStudentFromWizard}
          onClose={() => setShowEnrollmentWizard(false)}
        />
      )}
    </ErrorBoundary>
  );
};

export default App;
