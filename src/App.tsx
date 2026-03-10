import React, { useMemo, useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { LoginScreen } from './components/LoginScreen';
import { DashboardView } from './views/DashboardView';
import { LandingPage } from './views/LandingPage';
import { StudentForm } from './components/StudentForm';
import { SettingsView } from './views/SettingsView';
import { ReportsView } from './views/ReportsView';
import { ActivitiesView } from './views/ActivitiesView';
import { StudentProfile } from './components/StudentProfile';
import { generateProtocolAI } from './services/geminiService';
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
  Appointment,
} from './types';
import { ShieldCheck, Menu } from 'lucide-react';
import { DocumentBuilder } from './components/DocumentBuilder';
import { AdminDashboard } from './views/AdminDashboard';
import { ReferralView } from './views/ReferralView';
import { ServiceControlView } from './views/ServiceControlView';
import { SchoolReportView } from './views/SchoolReportView';
import { FichasComplementaresView } from './views/FichasComplementaresView';
import { AppointmentsView } from './views/AppointmentsView';
import { StudentsListView } from './views/StudentsListView';
import { IncluiLabView } from './views/IncluiLabView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LGPDModal } from './components/LGPDModal';
import { PedagogicalCopilot } from './components/PedagogicalCopilot';
import { PaymentService } from './services/paymentService';
import { supabase, DEMO_MODE } from './services/supabase';
import { databaseService } from './services/databaseService';

// --- Helper Functions ---
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

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [view, setView] = useState('landing');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const [user, setUser] = useState<User>(MOCK_USER);

  // Dados do app
  const [students, setStudents] = useState<Student[]>([]);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [serviceRecords, setServiceRecords] = useState<ServiceRecord[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  // Workflow AtivaIA — node IDs para o Copilot
  const [workflowNodeIds, setWorkflowNodeIds] = useState<string[]>([]);

  // Navegação
  const [viewingStudent, setViewingStudent] = useState<Student | null>(null);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);

  // Documentos
  const [generating, setGenerating] = useState(false);
  const [currentProtocol, setCurrentProtocol] = useState<Protocol | null>(null);
  const [activeDocumentType, setActiveDocumentType] = useState<DocumentType>(DocumentType.PEI);

  const [auditSearch, setAuditSearch] = useState('');
  const [showLGPD, setShowLGPD] = useState(false);

  // ✅ Fonte única para limites/creditos vindos do banco
  const [tenantSummary, setTenantSummary] = useState<any | null>(null);
  const [effectivePlans, setEffectivePlans] = useState<any[]>([]);

  const planName = useMemo(() => {
    // user.plan é label (PlanTier). Vamos mapear para DB code
    if (user.plan === PlanTier.PREMIUM) return 'MASTER';
    if (user.plan === PlanTier.PRO) return 'PRO';
    if (user.plan === PlanTier.FREE) return 'FREE';
    if (user.plan === PlanTier.INSTITUTIONAL) return 'INSTITUTIONAL';
    return 'FREE';
  }, [user.plan]);

  const planEff = useMemo(() => {
    const found = effectivePlans.find((p: any) => String(p?.name ?? '').toUpperCase() === planName);
    return found ?? null;
  }, [effectivePlans, planName]);

  const planMaxStudents = useMemo(() => {
    const v = Number(planEff?.max_students ?? tenantSummary?.studentLimitBase ?? 0);
    return Number.isFinite(v) ? v : 0;
  }, [planEff?.max_students, tenantSummary?.studentLimitBase]);

  const planMonthlyCredits = useMemo(() => {
    const v = Number(planEff?.monthly_credits ?? 0);
    return Number.isFinite(v) ? v : 0;
  }, [planEff?.monthly_credits]);

  const creditsAvailable = useMemo(() => {
    const v = Number(tenantSummary?.aiCreditsRemaining ?? 0);
    return Number.isFinite(v) ? v : 0;
  }, [tenantSummary?.aiCreditsRemaining]);

  const creditsResetAt = useMemo(() => {
    // renewalDateCredits já vem do getTenantSummary como next_billing (ISO)
    return (tenantSummary?.renewalDateCredits ?? null) as string | null;
  }, [tenantSummary?.renewalDateCredits]);

  // Restaurar sessão (Supabase Auth)
  useEffect(() => {
    (async () => {
      if (DEMO_MODE) return;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;

      const profile = await databaseService.getUserProfile(session.user.id);
      if (!profile) return;

      setUser(profile);
      setIsAuthenticated(true);

      const [studentsDb, protocolsDb, summaryDb, plansDb, appointmentsDb] = await Promise.all([
        databaseService.getStudents(profile.id),
        databaseService.getProtocols(profile.id),
        databaseService.getTenantSummary(profile.id),
        databaseService.getEffectivePlans(),
        databaseService.getAppointments(profile.id),
      ]);

      setStudents(studentsDb);
      setProtocols(protocolsDb);
      setTenantSummary(summaryDb);
      setEffectivePlans(plansDb);
      setAppointments(appointmentsDb);
    })();
  }, []);

  // LOGIN
  const handleLogin = async (email: string, pass: string) => {
    if (DEMO_MODE) {
      const mockUser = {
        ...MOCK_USER,
        email,
        name: 'Modo Demonstração',
        plan: PlanTier.FREE,
        role: UserRole.TEACHER,
        isAdmin: false,
      };
      setUser(mockUser);
      setIsAuthenticated(true);
      setView('dashboard');

      // demo: limites básicos
      setEffectivePlans([
        { name: 'FREE', max_students: 5, monthly_credits: 0 },
        { name: 'PRO', max_students: 30, monthly_credits: 50 },
        { name: 'MASTER', max_students: 999, monthly_credits: 70 },
      ]);
      setTenantSummary({
        aiCreditsRemaining: 0,
        studentLimitBase: 5,
        renewalDateCredits: null,
      });
      return;
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;

      const userId = data.user?.id;
      if (!userId) throw new Error('Falha ao obter usuário autenticado.');

      const profile = await databaseService.getUserProfile(userId);
      if (!profile) {
        throw new Error(
          'Perfil não encontrado. Verifique o trigger de criação de usuário (tabela users).'
        );
      }

      const needsLGPD = !profile.lgpdConsent?.accepted;
      const needsSchoolSetup =
        !profile.schoolConfigs ||
        profile.schoolConfigs.length === 0 ||
        !(profile.schoolConfigs[0] as any)?.schoolName?.trim();

      if (needsLGPD) setShowLGPD(true);

      setUser(profile);
      setIsAuthenticated(true);
      setView(needsLGPD || needsSchoolSetup ? 'settings' : 'dashboard');

      const [studentsDb, protocolsDb, summaryDb, plansDb, appointmentsDb] = await Promise.all([
        databaseService.getStudents(profile.id),
        databaseService.getProtocols(profile.id),
        databaseService.getTenantSummary(profile.id),
        databaseService.getEffectivePlans(),
        databaseService.getAppointments(profile.id),
      ]);

      setStudents(studentsDb);
      setProtocols(protocolsDb);
      setTenantSummary(summaryDb);
      setEffectivePlans(plansDb);
      setAppointments(appointmentsDb);
    } catch (e: any) {
      alert(e?.message || 'Erro ao entrar. Verifique email e senha.');
    }
  };

  const handleLGPDAccept = async () => {
    try {
      await databaseService.acceptLGPD(user.id, { termVersion: 'v1.0' });
    } catch {}

    setUser(prev => ({
      ...prev,
      lgpdConsent: {
        accepted: true,
        acceptedAt: new Date().toISOString(),
        ipAddress: '127.0.0.1',
        termVersion: 'v1.0',
      },
    }));
    setShowLGPD(false);
    setView('settings');
  };

  const handleLogout = async () => {
    try {
      if (!DEMO_MODE) await supabase.auth.signOut();
    } catch {}
    setIsAuthenticated(false);
    setView('landing');
    setUser(MOCK_USER);
    setStudents([]);
    setProtocols([]);
    setServiceRecords([]);
    setAppointments([]);
    setTenantSummary(null);
    setEffectivePlans([]);
    setViewingStudent(null);
    setEditingStudent(null);
    setCurrentProtocol(null);
  };

  // ✅ validação usa banco (planMaxStudents / creditsAvailable) e mantém PaymentService
  const checkPermission = (feature: 'add_student' | 'ai_gen' | 'charts') => {
    const access = PaymentService.checkAccess(user);
    if (!access.allowed && access.reason === 'payment_required') {
      alert('Sua assinatura está atrasada. Regularize para continuar.');
      return false;
    }

    const legacy = getPlanLimits(user.plan);

    if (feature === 'add_student') {
      const limit = planMaxStudents > 0 ? planMaxStudents : legacy.students;
      if (students.length >= limit) return false;
      return true;
    }

    if (feature === 'ai_gen') {
      // FREE sem IA -> creditsAvailable será 0
      if (creditsAvailable <= 0) return false;
      return true;
    }

    if (feature === 'charts') {
      if (!legacy.charts) return false;
      return true;
    }

    return true;
  };

  const triggerUpgrade = () => alert(`Limite do plano atingido. Faça upgrade para continuar.`);

  // --- Student Logic ---
  const handleSelectStudent = (student: Student) => {
    setViewingStudent(student);
    setView('student_profile');
  };

  const saveStudent = async (studentData: Student) => {
    try {
      if (editingStudent && editingStudent.id) {
        await databaseService.saveStudent(studentData);
        const updatedList = students.map(s => (s.id === studentData.id ? studentData : s));
        setStudents(updatedList);
        setViewingStudent(studentData);
      } else {
        if (!checkPermission('add_student')) return triggerUpgrade();
        const saved = await databaseService.saveStudent(studentData);
        const fresh = await databaseService.getStudents();
        setStudents(fresh);

        // Timeline: aluno cadastrado
        if (!DEMO_MODE && saved?.id && user?.tenant_id) {
          const { TimelineService } = await import('./services/persistenceService');
          await TimelineService.add({
            tenantId:   user.tenant_id,
            studentId:  saved.id,
            eventType:  'matricula',
            title:      'Aluno cadastrado no sistema',
            description: studentData.tipo_aluno === 'em_triagem' ? 'Em Triagem' : 'Com Laudo',
            icon:       'User',
            author:     user.name,
          });
        }
      }

      // refresh summary (para bater contador/limite)
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
      console.error(e);
      alert(e?.message || 'Erro ao excluir aluno.');
    }
  };

  const updateStudentEvolution = async (updatedStudent: Student) => {
    setStudents(students.map(s => (s.id === updatedStudent.id ? updatedStudent : s)));
    if (viewingStudent && viewingStudent.id === updatedStudent.id) setViewingStudent(updatedStudent);
    try {
      await databaseService.saveStudent(updatedStudent);
    } catch (e) {
      console.error('[updateStudentEvolution] erro ao persistir no banco:', e);
    }
  };

  // --- Document Logic ---
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
        status: status,
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
      } catch (e) {
        console.error('[handleSaveDocument] erro ao persistir no banco:', e);
      }
      // Timeline: documento atualizado
      if (!DEMO_MODE && student?.id && user?.tenant_id) {
        const { TimelineService } = await import('./services/persistenceService');
        await TimelineService.add({
          tenantId:    user.tenant_id,
          studentId:   student.id,
          eventType:   'protocolo',
          title:       `${activeDocumentType} atualizado`,
          description: `Status: ${status} — editado por ${user.name}`,
          linkedId:    currentProtocol.id,
          linkedTable: 'documents',
          icon:        'FileText',
          author:      user.name,
        });
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
        status: status,
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
        const saved = await databaseService.saveDocument({
          ...newProtocol,
          tenant_id: user.tenant_id,
          structured_data: data,
        });
        // Timeline: documento criado
        if (!DEMO_MODE && student?.id && user?.tenant_id) {
          const { TimelineService } = await import('./services/persistenceService');
          await TimelineService.add({
            tenantId:    user.tenant_id,
            studentId:   student.id,
            eventType:   'protocolo',
            title:       `${activeDocumentType} criado`,
            description: `Status: ${status} — gerado por ${user.name}`,
            linkedId:    saved?.id ?? newProtocol.id,
            linkedTable: 'documents',
            icon:        'FileText',
            author:      user.name,
          });
        }
      } catch (e) {
        console.error('[handleSaveDocument] erro ao persistir no banco:', e);
      }
    }
  };

  const handleDeleteDocument = (protocolId: string) => {
    setProtocols(prev => prev.filter(p => p.id !== protocolId));
    setCurrentProtocol(null);
    if (viewingStudent) setView('student_profile');
    else setView('dashboard');
  };

  const handleGenerateAI = async (student: Student) => {
    if (!checkPermission('ai_gen')) return triggerUpgrade();
    if (!student) return alert('Erro: Aluno não identificado.');

    setGenerating(true);

    const laudoDoc = student?.documents?.find(
      d => d.type === 'Laudo' && d.url && d.url.startsWith('data:')
    );
    const docContent = laudoDoc ? laudoDoc.url : undefined;

    try {
      const jsonString = await generateProtocolAI(activeDocumentType, student, user, docContent);

      let structuredData: DocumentData;
      try {
        const cleanJson = jsonString.replace(/```json/g, '').replace(/```/g, '');
        structuredData = JSON.parse(cleanJson);
      } catch (e) {
        console.error('Failed to parse AI JSON', e);
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
      console.error('[AI] generate protocol failed', e);
      alert(e?.message || 'Erro ao gerar protocolo.');
    } finally {
      setGenerating(false);
    }
  };

  // --- Views ---
  if (view === 'guest') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-xl max-w-md w-full text-center">
          <h2 className="text-xl font-bold mb-4">Acesso de Colaborador</h2>
          <p className="text-gray-600 mb-6">
            Você foi convidado para colaborar em um documento. (Modo Simulação)
          </p>
          <button
            onClick={() => (window.location.href = '/')}
            className="bg-blue-600 text-white w-full py-2 rounded font-bold hover:bg-blue-700"
          >
            Acessar Painel (Login Necessário)
          </button>
          <p className="text-xs text-gray-400 mt-4">
            Em produção, isso abriria o editor restrito.
          </p>
        </div>
      </div>
    );
  }

  if (view === 'audit') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-xl w-full bg-white p-8 rounded-2xl shadow-xl text-center">
          <ShieldCheck className="mx-auto text-brand-600 h-16 w-16 mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Validação Pública</h2>
          <input
            className="w-full text-center text-lg p-4 border border-gray-300 rounded-lg mb-4 uppercase tracking-widest font-mono"
            placeholder="XXXXX-USER-DATE"
            value={auditSearch}
            onChange={e => setAuditSearch(e.target.value)}
          />
          <button
            className="w-full bg-brand-600 text-white py-3 rounded-lg font-bold"
            onClick={() => {
              const found = protocols.find(p => p.auditCode === auditSearch);
              if (found)
                alert(
                  `✅ VÁLIDO: ${found.type} - ${found.studentName}\nÚltima edição: ${found.lastEditedBy}`
                );
              else alert('❌ Inválido ou não encontrado.');
            }}
          >
            Verificar Autenticidade
          </button>
          <button
            onClick={() => setView('landing')}
            className="mt-4 text-gray-500 hover:text-gray-800 text-sm"
          >
            Voltar
          </button>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (view === 'login')
      return <LoginScreen onLogin={handleLogin} onGuest={() => alert('Modo visitante foi desativado. Faça login.')} />;
    return <LandingPage onLogin={() => setView('login')} onRegister={() => {}} onAudit={() => setView('audit')} />;
  }

  const isDocView = ['protocols', 'pdi', 'paee', 'estudo_caso', 'ficha'].includes(view);

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
          setView={v => {
            if (['protocols', 'pdi', 'paee', 'estudo_caso', 'ficha'].includes(v)) {
              const map: any = {
                protocols: DocumentType.PEI,
                pdi: DocumentType.PDI,
                paee: DocumentType.PAEE,
                estudo_caso: DocumentType.ESTUDO_CASO,
                ficha: DocumentType.FICHA,
              };
              initDocumentGeneration(map[v]);
              if (!viewingStudent && view !== 'student_profile') setViewingStudent(null);
            }
            setEditingStudent(null);
            setView(v);
            if (window.innerWidth < 1024) setIsSidebarOpen(false);
          }}
          isOpen={isSidebarOpen}
          onLogout={handleLogout}
          studentCount={students.length}
          protocolCount={protocols.length}
          planMaxStudents={planMaxStudents} // ✅ banco
        />

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
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
            {view === 'admin' && <AdminDashboard subscribers={[]} onUpdatePlan={() => {}} />}

            {view === 'dashboard' && (
              <DashboardView
                userName={user.name}
                students={students}
                protocols={protocols}
                appointments={appointments}
                planMaxStudents={planMaxStudents}
                planMonthlyCredits={planMonthlyCredits}
                creditsAvailable={creditsAvailable}
                creditsResetAt={creditsResetAt}
                onNavigate={setView}
              />
            )}

            {view === 'encaminhamento' && (
              <ReferralView user={user} students={students} onBack={() => setView('dashboard')} />
            )}

            {view === 'service_control' && (
              <ServiceControlView
                user={user}
                students={students}
                serviceRecords={serviceRecords}
                onAddRecord={rec => setServiceRecords([rec, ...serviceRecords])}
              />
            )}

            {view === 'relatorio_escola' && (
              <SchoolReportView user={user} students={students} onBack={() => setView('dashboard')} />
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
                  setView('protocols');
                }}
                onCreateDerived={handleCreateDerivedProtocol}
                userPlan={user.plan}
                user={user}
                serviceRecords={serviceRecords}
                onAddServiceRecord={rec => setServiceRecords([rec, ...serviceRecords])}
                onUpdateStudent={updatedStudent => {
                  setStudents(prev => prev.map(s => s.id === updatedStudent.id ? updatedStudent : s));
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
                  initialProtocol={currentProtocol?.id !== 'temp' ? currentProtocol : null}
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

            {view === 'activities' && <ActivitiesView students={students} user={user} />}
            {view === 'incluiLab' && <IncluiLabView students={students} user={user} sidebarOpen={isSidebarOpen} onWorkflowNodesChange={setWorkflowNodeIds} />}
            {view === 'ativaIA' && <IncluiLabView students={students} user={user} defaultTab="workflow" sidebarOpen={isSidebarOpen} onWorkflowNodesChange={setWorkflowNodeIds} />}
            {view === 'eduLensIA' && <IncluiLabView students={students} user={user} defaultTab="scanner" sidebarOpen={isSidebarOpen} onWorkflowNodesChange={setWorkflowNodeIds} />}
            {view === 'neuroDesign' && <IncluiLabView students={students} user={user} defaultTab="redesign" sidebarOpen={isSidebarOpen} onWorkflowNodesChange={setWorkflowNodeIds} />}
            {view === 'relatorios' && (
              <ReportsView
                students={students}
                onUpdateStudent={updateStudentEvolution}
                currentUser={user}
                currentPlan={user.plan}
              />
            )}
            {view === 'fichas_complementares' && <FichasComplementaresView students={students} user={user} />}
            {view === 'agenda' && (
              <AppointmentsView
                students={students}
                user={user}
                appointments={appointments}
                onAddAppointment={async (apt: Appointment) => {
                  // Otimista: atualiza estado imediatamente
                  setAppointments((prev: Appointment[]) => [apt, ...prev]);
                  if (!DEMO_MODE && user?.id) {
                    const saved = await databaseService.saveAppointment(apt, user.id);
                    if (saved && saved.id !== apt.id) {
                      // Substitui o temporário pelo retorno do banco (ID real)
                      setAppointments((prev: Appointment[]) => prev.map((a: Appointment) => a.id === apt.id ? saved : a));
                    }
                  }
                }}
                onUpdateAppointment={async (apt: Appointment) => {
                  setAppointments((prev: Appointment[]) => prev.map((a: Appointment) => a.id === apt.id ? apt : a));
                  if (!DEMO_MODE && user?.id) {
                    await databaseService.saveAppointment(apt, user.id);
                  }
                }}
                onDeleteAppointment={async (id: string) => {
                  setAppointments((prev: Appointment[]) => prev.filter((a: Appointment) => a.id !== id));
                  if (!DEMO_MODE) {
                    await databaseService.deleteAppointment(id);
                  }
                }}
              />
            )}
            {view === 'settings' && (
              <SettingsView
                user={user}
                onUpdateUser={setUser}
                onFinishSetup={() => setView('dashboard')}
              />
            )}
            {view === 'guides' && <div className="text-center py-20 text-gray-500">Módulo de Guias em Desenvolvimento.</div>}
          </main>
        </div>
      </div>

      {/* Copilot Pedagógico — flutuante, disponível em todas as telas */}
      <PedagogicalCopilot
        currentView={view}
        user={user}
        students={students}
        protocols={protocols}
        appointments={appointments}
        viewingStudent={viewingStudent}
        workflowNodeIds={workflowNodeIds}
        onNavigate={v => {
          setView(v);
          if (window.innerWidth < 1024) setIsSidebarOpen(false);
        }}
      />
    </ErrorBoundary>
  );
};

export default App;