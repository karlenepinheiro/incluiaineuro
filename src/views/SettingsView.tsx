import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AddOnProduct, TenantSummary, User, SchoolConfig, PlanTier, TeamMember, UserRole, resolvePlanTier, PLAN_LIMITS, formatPlanDisplayName, formatStudentLimit } from '../types';
import { SUBSCRIPTION_PLANS } from '../config/aiCosts';
import { Plus, Trash2, School, User as UserIcon, CreditCard, Star, Settings, Sparkles, AlertTriangle, ShoppingCart, Upload, Building2, MapPin, Phone, Hash, FileText, AlertCircle, ChevronDown, RefreshCw, ExternalLink, Search, CheckCircle, Lock, Eye, EyeOff, Shield, Info, Briefcase } from 'lucide-react';
import { fetchSchoolByINEP, validateINEPCode, type INEPFetchError } from '../services/inepService';
import { fetchAddressByCep, validateCep, normalizeCep, formatCep } from '../services/cepService';
import { PaymentService, /* DEFAULT_ADDONS */ } from '../services/paymentService';
import { databaseService } from '../services/databaseService';
import { supabase } from '../services/supabase';
import { SubscriptionStatusBadge } from '../components/SubscriptionStatusBadge';
import { CreditWalletService, CreditLedgerService, isFreeBootstrapEntry } from '../services/creditService';
import type { CreditLedgerEntry } from '../types';
import { getActiveSubscription, type ActiveSubscriptionInfo } from '../services/subscriptionService';
// Preços oficiais (Kiwify) — fonte única: atualize apenas aqui
const PLAN_PRICES = {
  PRO_MONTHLY:    79,   // R$ 79/mês mensal
  PRO_ANNUAL:     59,   // R$ 59/mês no plano anual (R$ 708/ano)
  MASTER_MONTHLY: 147,  // R$ 147/mês mensal
  MASTER_ANNUAL:  99,   // R$ 99/mês no plano anual (R$ 1.188/ano)
};

// Redefinição cirúrgica dos pacotes de crédito, conforme solicitado.
// O ideal seria alterar o arquivo original 'paymentService.ts'.
const DEFAULT_ADDONS: AddOnProduct[] = [
  {
    sku: 'CREDITS_100',
    title: '+100 Créditos IA',
    description: 'Para gerar documentos e atividades pontuais.',
    priceCents: 2990,
    quantity: 100,
    kind: 'AI_CREDITS',
  },
  {
    sku: 'CREDITS_300',
    title: '+300 Créditos IA',
    description: 'Ideal para o dia a dia do professor.',
    priceCents: 7990,
    quantity: 300,
    kind: 'AI_CREDITS',
    recommended: true,
  },
  {
    sku: 'CREDITS_900',
    title: '+900 Créditos IA',
    description: 'Melhor custo-benefício para uso intenso.',
    priceCents: 14990,
    quantity: 900,
    kind: 'AI_CREDITS',
  },
];

// ─── Helpers de máscara ───────────────────────────────────────────────────────
function maskCPF(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
function maskPhone(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (!d.length) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
function maskCEP(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}
function getPasswordStrength(p: string): { label: string; color: string; score: number } {
  let score = 0;
  if (p.length >= 8) score++;
  if (/[A-Z]/.test(p)) score++;
  if (/[0-9]/.test(p)) score++;
  if (/[^A-Za-z0-9]/.test(p)) score++;
  const levels = [
    { label: 'Muito fraca', color: '#ef4444' },
    { label: 'Fraca',       color: '#f97316' },
    { label: 'Razoável',    color: '#eab308' },
    { label: 'Boa',         color: '#22c55e' },
    { label: 'Forte',       color: '#16a34a' },
  ];
  return { ...levels[score], score };
}

interface SettingsViewProps {
  user: User;
  onUpdateUser: (updatedUser: User) => void;
  /** usado no onboarding (LGPD -> cadastrar escola/equipe -> dashboard) */
  onFinishSetup?: () => void;
  /** abre diretamente numa aba específica (ex: 'finance' ao clicar em Indicações no sidebar) */
  initialTab?: 'profile' | 'team' | 'finance';
}

export const SettingsView: React.FC<SettingsViewProps> = ({ user, onUpdateUser, onFinishSetup, initialTab }) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'team' | 'finance'>(initialTab ?? 'profile');
  const [name, setName] = useState(user.name);
  const [profilePhoto, setProfilePhoto] = useState<string | undefined>(user.profilePhoto);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [schools, setSchools] = useState<SchoolConfig[]>(user.schoolConfigs);

  // ─── Perfil pessoal ─────────────────────────────────────────────────────────
  const [phone, setPhone] = useState<string>(maskPhone(user.phone ?? ''));
  const [cpf, setCpf] = useState<string>(maskCPF(user.cpf ?? ''));
  const [cargo, setCargo] = useState<string>((user as any).cargo ?? '');

  // ─── Endereço pessoal ────────────────────────────────────────────────────────
  const [cep, setCep] = useState<string>(maskCEP((user as any).cep ?? ''));
  const [rua, setRua] = useState<string>((user as any).rua ?? '');
  const [numero, setNumero] = useState<string>((user as any).numero ?? '');
  const [complemento, setComplemento] = useState<string>((user as any).complemento ?? '');
  const [bairro, setBairro] = useState<string>((user as any).bairro ?? '');
  const [cidade, setCidade] = useState<string>((user as any).cidade ?? '');
  const [estado, setEstado] = useState<string>((user as any).estado ?? '');
  const [personalCepLoading, setPersonalCepLoading] = useState(false);
  const [personalCepStatus, setPersonalCepStatus] = useState<'idle' | 'found' | 'not_found'>('idle');
  const [codeBackfillBusy, setCodeBackfillBusy] = useState(false);
  const [codeBackfillResult, setCodeBackfillResult] = useState<Awaited<ReturnType<typeof databaseService.backfillMissingStudentCodes>> | null>(null);
  const canRunStudentCodeBackfill =
    user.role === UserRole.MANAGER ||
    user.role === UserRole.COORDINATOR ||
    user.role === UserRole.TECHNICAL_RESP ||
    !!(user as any).isAdmin;

  // ─── Preferências de documentos ─────────────────────────────────────────────
  const [displayName, setDisplayName] = useState<string>((user as any).display_name ?? '');
  const [professionalSignature, setProfessionalSignature] = useState<string>((user as any).professional_signature ?? '');
  const [docPhone, setDocPhone] = useState<string>(maskPhone((user as any).doc_phone ?? ''));

  // ─── Segurança ───────────────────────────────────────────────────────────────
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ─── Estado do save de perfil ────────────────────────────────────────────────
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ─── Último acesso (auth) ────────────────────────────────────────────────────
  const [lastSignIn, setLastSignIn] = useState<string | null>(null);
  const [newSchool, setNewSchool] = useState<Partial<SchoolConfig>>({ schoolName: '' });
  // ID da escola com formulário expandido; null = todos recolhidos
  const [expandedSchoolId, setExpandedSchoolId] = useState<string | null>(
    () => user.schoolConfigs.find(s => !s.schoolName?.trim())?.id ?? null
  );

  const [newMember, setNewMember] = useState<Partial<TeamMember>>({ role: 'Professor Regente' });

  const handleSavePersonal = async () => {
    setProfileBusy(true);
    setProfileMsg(null);
    try {
      await databaseService.updateUserProfile(user.id, {
        name,
        phone: phone.replace(/\D/g, '') ? phone : '',
        cpf: cpf.replace(/\D/g, '') ? cpf : '',
        cargo,
        profilePhotoUrl: profilePhoto ?? '',
        cep: cep.replace(/\D/g, '') ? cep : '',
        rua, numero, complemento, bairro, cidade, estado,
        displayName, professionalSignature,
        docPhone: docPhone.replace(/\D/g, '') ? docPhone : '',
      });
      onUpdateUser({
        ...user, name, phone, cpf,
        cargo, profilePhoto,
        cep, rua, numero, complemento, bairro, cidade, estado,
        display_name: displayName,
        professional_signature: professionalSignature,
        doc_phone: docPhone,
      } as any);
      setProfileMsg({ type: 'success', text: 'Dados salvos com sucesso!' });
    } catch (e: any) {
      setProfileMsg({ type: 'error', text: e?.message || 'Erro ao salvar dados.' });
    } finally {
      setProfileBusy(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 8) {
      setPasswordMsg({ type: 'error', text: 'A senha deve ter pelo menos 8 caracteres.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'As senhas não coincidem.' });
      return;
    }
    setPasswordBusy(true);
    setPasswordMsg(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMsg({ type: 'success', text: 'Senha atualizada com sucesso!' });
    } catch (e: any) {
      setPasswordMsg({ type: 'error', text: e?.message || 'Erro ao atualizar senha.' });
    } finally {
      setPasswordBusy(false);
    }
  };

  const handleStudentCodeBackfill = async () => {
    if (!canRunStudentCodeBackfill) return;
    const confirmed = window.confirm(
      'Gerar códigos apenas para alunos deste tenant que ainda estão sem Código do aluno? Códigos existentes não serão alterados.'
    );
    if (!confirmed) return;

    setCodeBackfillBusy(true);
    setCodeBackfillResult(null);
    try {
      const result = await databaseService.backfillMissingStudentCodes();
      setCodeBackfillResult(result);
    } catch (error: any) {
      setCodeBackfillResult({
        checked: 0,
        missing: 0,
        updated: 0,
        skipped: 0,
        failed: 1,
        errors: [{ studentId: 'tenant', error: error?.message ?? String(error) }],
      });
    } finally {
      setCodeBackfillBusy(false);
    }
  };

  const handlePersonalCepBlur = async (rawCep: string) => {
    const digits = normalizeCep(rawCep);
    if (!validateCep(digits)) return;
    setPersonalCepLoading(true);
    setPersonalCepStatus('idle');
    try {
      const data = await fetchAddressByCep(digits);
      if (data) {
        setRua(prev => data.logradouro || prev);
        setBairro(prev => data.bairro || prev);
        setCidade(prev => data.localidade || prev);
        setEstado(prev => data.uf || prev);
        setPersonalCepStatus('found');
      } else {
        setPersonalCepStatus('not_found');
      }
    } catch {
      setPersonalCepStatus('not_found');
    } finally {
      setPersonalCepLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        setLastSignIn(authUser?.last_sign_in_at ?? null);
      } catch { /* silencioso */ }
    })();
  }, []);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return alert('Selecione uma imagem (PNG, JPG).');
    if (file.size > 2 * 1024 * 1024) return alert('Imagem muito grande. Máx 2 MB.');
    const reader = new FileReader();
    reader.onloadend = () => setProfilePhoto(reader.result as string);
    reader.readAsDataURL(file);
  };

  const [tenantSummary, setTenantSummary] = useState<TenantSummary | null>(null);
  const [financeBusy, setFinanceBusy] = useState(false);
  const [financeError, setFinanceError] = useState<string | null>(null);
  const [creditLedger, setCreditLedger] = useState<CreditLedgerEntry[]>([]);
  const [showLedger, setShowLedger] = useState(false);

  const [activeSubscription, setActiveSubscription] = useState<ActiveSubscriptionInfo | null>(null);

  const totalStudentLimit = useMemo(() => {
    if (!tenantSummary) return null;
    return (tenantSummary.studentLimitBase || 0) + (tenantSummary.studentLimitExtra || 0);
  }, [tenantSummary]);

  const isSetupComplete = useMemo(() => {
    const lgpdAccepted = !!(user as any)?.lgpdConsent?.accepted;
    const first = schools[0];
    const schoolOk = !!first && !!first.schoolName?.trim() && !!first.managerName?.trim() && !!first.contact?.trim();
    return lgpdAccepted && schoolOk;
  }, [schools, user]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setFinanceError(null);
        const summary = await databaseService.getTenantSummary(user.id);
        if (alive) setTenantSummary(summary);
        // Carrega histórico do ledger + assinatura ativa (silencioso se falhar)
        if (alive && summary?.tenantId) {
          try {
            const [rawLedger, sub] = await Promise.all([
              CreditLedgerService.getHistory(summary.tenantId, 20),
              getActiveSubscription(summary.tenantId).catch(() => null),
            ]);
            if (alive) {
              // Para tenants com plano pago, oculta o lançamento de bootstrap FREE
              // legado (+60 "Créditos iniciais plano FREE") que aparecia junto ao
              // saldo correto do plano pago. O dado permanece íntegro no banco.
              const isPaidPlan = sub?.planCode != null && sub.planCode !== 'FREE';
              setCreditLedger(
                isPaidPlan ? rawLedger.filter(e => !isFreeBootstrapEntry(e)) : rawLedger
              );
              setActiveSubscription(sub);
            }
          } catch { /* silencioso */ }
        }
      } catch (e: any) {
        if (alive) setFinanceError(e?.message || 'Falha ao carregar dados financeiros');
      }
    })();
    return () => {
      alive = false;
    };
  }, [user.id]);

  useEffect(() => {
    // Se não existir nenhuma escola, criamos a primeira automaticamente para o usuário preencher.
    if (schools.length === 0) {
      const first: SchoolConfig = {
        id: crypto.randomUUID(),
        schoolName: '',
        managerName: '',
        aeeRepresentative: '',
        contact: '',
        team: [],
      };
      setSchools([first]);
      onUpdateUser({ ...user, schoolConfigs: [first] });
      setExpandedSchoolId(first.id); // nova escola começa expandida para preenchimento
    }
    // Onboarding: se o LGPD já foi aceito e ainda não tem escola, foca na aba de escolas.
    const lgpdAccepted = !!(user as any)?.lgpdConsent?.accepted;
    const missingSchoolName = !schools[0]?.schoolName?.trim();
    if (lgpdAccepted && missingSchoolName) setActiveTab('team');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addSchool = () => {
    if (!newSchool.schoolName) return alert("Nome obrigatório");
    const s: SchoolConfig = {
        id: crypto.randomUUID(),
        schoolName: newSchool.schoolName!,
        managerName: '',
        aeeRepresentative: '',
        contact: '',
        team: [],
    };
    const updated = [...schools, s];
    setSchools(updated);
    onUpdateUser({ ...user, schoolConfigs: updated });
    setNewSchool({ schoolName: '' });
    setExpandedSchoolId(s.id); // nova escola começa expandida para preenchimento
  };

  const addTeamMember = (schoolId: string) => {
      if (!newMember.name) return alert("Nome do profissional é obrigatório");
      
      const updatedSchools = schools.map(s => {
          if (s.id === schoolId) {
              const member: TeamMember = {
                  id: crypto.randomUUID(),
                  name: newMember.name!,
                  email: newMember.email || '',
                  phone: newMember.phone || '',
                  role: newMember.role as any
              };
              return { ...s, team: [...(s.team || []), member] };
          }
          return s;
      });
      
      setSchools(updatedSchools);
      onUpdateUser({ ...user, schoolConfigs: updatedSchools });
      setNewMember({ role: 'Professor Regente', name: '', email: '', phone: '' });
  };

  const removeTeamMember = (schoolId: string, memberId: string) => {
      const updatedSchools = schools.map(s => {
          if (s.id === schoolId) {
              return { ...s, team: (s.team || []).filter(m => m.id !== memberId) };
          }
          return s;
      });
      setSchools(updatedSchools);
      onUpdateUser({ ...user, schoolConfigs: updatedSchools });
  };

  const handleUpgrade = async (planCode: string) => {
    if (!tenantSummary) return alert('Carregando dados... tente em instantes.');
    setFinanceBusy(true);
    try {
      const planTier = planCode === 'MASTER' ? PlanTier.PREMIUM : PlanTier.PRO;
      const url = await PaymentService.getCheckoutUrl(planTier, user);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      alert(e?.message || 'Não foi possível iniciar o checkout.');
    } finally {
      setFinanceBusy(false);
    }
  };

  const handleUpgradeAnnual = async (planCode: string) => {
    if (!tenantSummary) return alert('Carregando dados... tente em instantes.');
    setFinanceBusy(true);
    try {
      const planTier = planCode === 'MASTER' ? PlanTier.PREMIUM : PlanTier.PRO;
      const url = await PaymentService.getAnnualCheckoutUrl(planTier, user);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      alert(e?.message || 'Não foi possível iniciar o checkout anual.');
    } finally {
      setFinanceBusy(false);
    }
  };

  const openCustomerPortal = async () => {
    try {
      setFinanceBusy(true);
      // Prioriza link de atualização do gateway se disponível
      if (activeSubscription?.providerUpdatePaymentLink) {
        window.open(activeSubscription.providerUpdatePaymentLink, '_blank', 'noopener,noreferrer');
        return;
      }
      const url = await PaymentService.manageSubscription(user.id);
      window.open(url, '_blank');
    } catch (e: any) {
      alert(e?.message || 'Não foi possível abrir o portal de cobrança.');
    } finally {
      setFinanceBusy(false);
    }
  };

  const buyAddOn = async (product: AddOnProduct) => {
    if (!tenantSummary) return;
    try {
      setFinanceBusy(true);

      // Registra intenção de compra
      await databaseService.createPurchaseIntent({
        tenantId: tenantSummary.tenantId,
        userId: user.id,
        kind: product.kind,
        sku: product.sku,
        quantity: product.quantity,
        priceCents: product.priceCents,
      });

      let url: string;

      url = await PaymentService.getAddOnCheckoutUrl(product.sku, user, {
        qty: String(product.quantity),
        kind: product.kind,
      });

      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      alert(e?.message || 'Não foi possível abrir o checkout do pacote.');
    } finally {
      setFinanceBusy(false);
    }
  };

  const subscriptionStatus = tenantSummary?.subscriptionStatus ?? user.subscriptionStatus ?? 'ACTIVE';
  const isOverdue = subscriptionStatus === 'OVERDUE';
  const isCanceled = subscriptionStatus === 'CANCELED';
  const needsPayment = isOverdue || isCanceled;

  // Plano efetivo — normalizado para comparações de UI
  const effectivePlan = resolvePlanTier(tenantSummary?.planTier ?? user.plan);
  const isFreePlan    = effectivePlan === PlanTier.FREE;
  const isProPlan     = effectivePlan === PlanTier.PRO;
  const isMasterPlan  = effectivePlan === PlanTier.PREMIUM;
  const monthlyCredits = PLAN_LIMITS[effectivePlan].ai_credits;

  // Data de vencimento — prioriza DB subscription, depois tenantSummary
  const expiryDate = activeSubscription?.currentPeriodEnd
    ?? activeSubscription?.nextDueDate
    ?? tenantSummary?.renewalDatePlan
    ?? null;
  const handlePayNow = async () => {
    setFinanceBusy(true);
    try {
      // Prioridade: link direto do gateway > Kiwify fallback
      const directLink = activeSubscription?.providerPaymentLink;
      if (directLink) {
        window.open(directLink, '_blank', 'noopener,noreferrer');
      } else {
        const url = await PaymentService.getCheckoutUrl(user.plan, user);
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (e: any) {
      alert(e?.message || 'Não foi possível abrir o checkout.');
    } finally {
      setFinanceBusy(false);
    }
  };

  // Alerta de cadastro institucional incompleto
  const schoolIncomplete = !schools[0]?.schoolName?.trim() || !schools[0]?.cnpj?.trim() || !schools[0]?.email?.trim();

  return (
    <div className="max-w-5xl mx-auto pb-20">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Configurações</h2>

      {schoolIncomplete && activeTab !== 'finance' && (
        <div className="mb-6 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
          <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-800">Cadastro institucional incompleto</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Complete os dados da escola (nome, CNPJ, e-mail institucional) em <button className="underline font-bold" onClick={() => setActiveTab('team')}>Equipe &amp; Escolas</button> para que todos os documentos e PDFs gerados contenham o cabeçalho oficial da instituição.
            </p>
          </div>
        </div>
      )}
      <div className="flex gap-4 mb-8 border-b border-gray-200 overflow-x-auto">
          <button onClick={() => setActiveTab('profile')} className={`pb-3 px-2 font-bold text-sm whitespace-nowrap ${activeTab === 'profile' ? 'text-brand-600 border-b-2 border-brand-600' : 'text-gray-500'}`}>Perfil</button>
          <button onClick={() => setActiveTab('team')} className={`pb-3 px-2 font-bold text-sm whitespace-nowrap ${activeTab === 'team' ? 'text-brand-600 border-b-2 border-brand-600' : 'text-gray-500'}`}>Equipe & Escolas</button>
          <button onClick={() => setActiveTab('finance')} className={`pb-3 px-2 font-bold text-sm whitespace-nowrap ${activeTab === 'finance' ? 'text-brand-600 border-b-2 border-brand-600' : 'text-gray-500'}`}>Financeiro</button>
      </div>

      {activeTab === 'profile' && (
        <div className="space-y-5">

          {/* ── Card 1: Dados Pessoais ─────────────────────────────────────── */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
              <UserIcon size={16} className="text-brand-600" />
              <h3 className="font-bold text-gray-800">Dados Pessoais</h3>
            </div>
            <div className="p-6">
              <div className="flex flex-col sm:flex-row gap-6 items-start">
                {/* Avatar */}
                <div className="flex flex-col items-center gap-2 shrink-0">
                  <div
                    onClick={() => photoInputRef.current?.click()}
                    className="w-24 h-24 rounded-full border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center cursor-pointer hover:border-brand-400 transition overflow-hidden"
                    title="Clique para trocar a foto"
                  >
                    {profilePhoto ? (
                      <img src={profilePhoto} alt="foto" className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center gap-1">
                        <Upload size={20} className="text-gray-400" />
                        <span className="text-[10px] text-gray-400">Foto</span>
                      </div>
                    )}
                  </div>
                  <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                  {profilePhoto ? (
                    <button onClick={() => setProfilePhoto(undefined)} className="text-[10px] text-red-500 hover:underline">Remover</button>
                  ) : (
                    <span className="text-[10px] text-gray-400 text-center">PNG/JPG, máx 2 MB</span>
                  )}
                </div>

                {/* Campos */}
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nome Completo *</label>
                    <input
                      value={name}
                      onChange={e => setName(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                      placeholder="Seu nome completo"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">CPF</label>
                    <input
                      value={cpf}
                      onChange={e => setCpf(maskCPF(e.target.value))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                      placeholder="000.000.000-00"
                      inputMode="numeric"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Telefone / WhatsApp</label>
                    <input
                      value={phone}
                      onChange={e => setPhone(maskPhone(e.target.value))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                      placeholder="(00) 00000-0000"
                      inputMode="tel"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1 flex items-center gap-1"><Briefcase size={11} className="text-gray-400" /> Cargo / Função</label>
                    <input
                      value={cargo}
                      onChange={e => setCargo(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                      placeholder="Ex: Professora AEE, Coordenadora..."
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold text-gray-500 uppercase">E-mail</span>
                      <span className="inline-flex items-center gap-1 text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                        <Lock size={8} /> bloqueado
                      </span>
                    </div>
                    <input
                      value={user.email}
                      readOnly
                      className="w-full border border-gray-100 rounded-xl px-3 py-2.5 text-sm bg-gray-50 text-gray-500 cursor-not-allowed"
                    />
                    <p className="text-[10px] text-gray-400 mt-1">Para alterar o e-mail, entre em contato com o suporte.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {canRunStudentCodeBackfill && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
                <Hash size={16} className="text-brand-600" />
                <h3 className="font-bold text-gray-800">Manutenção de Códigos dos Alunos</h3>
              </div>
              <div className="p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Gerar códigos ausentes</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Atualiza somente alunos deste tenant sem código. Códigos existentes permanecem intocados.
                  </p>
                  {codeBackfillResult && (
                    <p className={`text-xs mt-2 ${codeBackfillResult.failed ? 'text-amber-700' : 'text-green-700'}`}>
                      Verificados: {codeBackfillResult.checked} · Sem código: {codeBackfillResult.missing} · Atualizados: {codeBackfillResult.updated} · Ignorados: {codeBackfillResult.skipped} · Falhas: {codeBackfillResult.failed}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleStudentCodeBackfill}
                  disabled={codeBackfillBusy}
                  className="bg-brand-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-brand-700 disabled:opacity-50 flex items-center gap-2 transition whitespace-nowrap"
                >
                  {codeBackfillBusy ? <RefreshCw size={14} className="animate-spin" /> : <Hash size={14} />}
                  Gerar códigos ausentes
                </button>
              </div>
            </div>
          )}

          {/* ── Card 2: Segurança da Conta ────────────────────────────────── */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
              <Shield size={16} className="text-brand-600" />
              <h3 className="font-bold text-gray-800">Segurança da Conta</h3>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nova Senha</label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                      placeholder="Mínimo 8 caracteres"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {newPassword && (() => {
                    const s = getPasswordStrength(newPassword);
                    return (
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${(s.score / 4) * 100}%`, backgroundColor: s.color }} />
                        </div>
                        <span className="text-[10px] font-semibold" style={{ color: s.color }}>{s.label}</span>
                      </div>
                    );
                  })()}
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Confirmar Nova Senha</label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                      placeholder="Repita a nova senha"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {confirmPassword && newPassword !== confirmPassword && (
                    <p className="text-[10px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={10} /> As senhas não coincidem.</p>
                  )}
                </div>
              </div>

              {passwordMsg && (
                <div className={`mt-3 p-3 rounded-xl text-sm flex items-center gap-2 max-w-lg ${passwordMsg.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                  {passwordMsg.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                  {passwordMsg.text}
                </div>
              )}

              <div className="flex items-center gap-4 mt-4 flex-wrap">
                <button
                  onClick={handleChangePassword}
                  disabled={passwordBusy || newPassword.length < 8 || newPassword !== confirmPassword}
                  className="bg-brand-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-brand-700 disabled:opacity-50 flex items-center gap-2 transition"
                >
                  {passwordBusy ? <RefreshCw size={14} className="animate-spin" /> : <Lock size={14} />}
                  Atualizar senha
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm('Isso vai encerrar a sessão em todos os dispositivos. Confirmar?')) return;
                    await supabase.auth.signOut({ scope: 'global' });
                    window.location.reload();
                  }}
                  className="text-sm text-gray-400 hover:text-red-600 hover:underline transition"
                >
                  Sair de todos os dispositivos
                </button>
              </div>
            </div>
          </div>

          {/* ── Card 3: Endereço ──────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
              <MapPin size={16} className="text-brand-600" />
              <h3 className="font-bold text-gray-800">Endereço</h3>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-6 gap-4">
                <div className="col-span-6 sm:col-span-2">
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">CEP</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={cep}
                      onChange={e => { setCep(maskCEP(e.target.value)); setPersonalCepStatus('idle'); }}
                      onBlur={e => handlePersonalCepBlur(e.target.value)}
                      placeholder="00000-000"
                      maxLength={9}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 pr-7"
                    />
                    {personalCepLoading && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-brand-500 animate-pulse">●</span>}
                  </div>
                  {personalCepStatus === 'found' && <p className="text-[10px] text-green-600 mt-0.5 font-semibold flex items-center gap-1"><CheckCircle size={9} /> Endereço preenchido</p>}
                  {personalCepStatus === 'not_found' && <p className="text-[10px] text-orange-500 mt-0.5">CEP não encontrado</p>}
                </div>
                <div className="col-span-6 sm:col-span-4">
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Rua / Logradouro</label>
                  <input value={rua} onChange={e => setRua(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" placeholder="Nome da rua" />
                </div>
                <div className="col-span-6 sm:col-span-2">
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Número</label>
                  <input value={numero} onChange={e => setNumero(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" placeholder="123" />
                </div>
                <div className="col-span-6 sm:col-span-4">
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Complemento</label>
                  <input value={complemento} onChange={e => setComplemento(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" placeholder="Apto, Bloco... (opcional)" />
                </div>
                <div className="col-span-6 sm:col-span-2">
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Bairro</label>
                  <input value={bairro} onChange={e => setBairro(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" placeholder="Bairro" />
                </div>
                <div className="col-span-6 sm:col-span-3">
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Cidade</label>
                  <input value={cidade} onChange={e => setCidade(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" placeholder="Cidade" />
                </div>
                <div className="col-span-6 sm:col-span-1">
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">UF</label>
                  <input value={estado} onChange={e => setEstado(e.target.value.toUpperCase().slice(0, 2))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" placeholder="TO" maxLength={2} />
                </div>
              </div>
            </div>
          </div>

          {/* ── Card 4: Preferências de Documentos ───────────────────────── */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
              <FileText size={16} className="text-brand-600" />
              <h3 className="font-bold text-gray-800">Preferências de Documentos</h3>
              <span className="text-xs text-gray-400 ml-1">Dados que aparecem nos PDFs gerados</span>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nome exibido nos documentos</label>
                  <input
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                    placeholder="Ex: Profa. Maria Silva — AEE"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">Se vazio, o nome completo será usado.</p>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Assinatura profissional</label>
                  <input
                    value={professionalSignature}
                    onChange={e => setProfessionalSignature(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                    placeholder="Ex: Especialista em Educação Inclusiva · CRP 00000"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Telefone nos documentos</label>
                  <input
                    value={docPhone}
                    onChange={e => setDocPhone(maskPhone(e.target.value))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                    placeholder="(00) 00000-0000"
                    inputMode="tel"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── Botão salvar (cards 1, 3 e 4) ────────────────────────────── */}
          {profileMsg && (
            <div className={`p-3 rounded-xl text-sm flex items-center gap-2 ${profileMsg.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
              {profileMsg.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
              {profileMsg.text}
            </div>
          )}
          <div className="flex justify-end">
            <button
              onClick={handleSavePersonal}
              disabled={profileBusy}
              className="bg-brand-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-brand-700 disabled:opacity-60 flex items-center gap-2 transition shadow-sm"
            >
              {profileBusy && <RefreshCw size={15} className="animate-spin" />}
              Salvar alterações
            </button>
          </div>

          {/* ── Card 5: Informações da Conta (somente leitura) ───────────── */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
              <Info size={16} className="text-gray-400" />
              <h3 className="font-bold text-gray-700">Informações da Conta</h3>
              <span className="text-xs text-gray-400 ml-1">Somente leitura</span>
            </div>
            <div className="p-6">
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-5">
                <div>
                  <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Plano atual</dt>
                  <dd className="mt-1 font-bold text-gray-900 text-sm">
                    {formatPlanDisplayName(
                      isFreePlan ? 'FREE' : isProPlan ? 'PRO' : 'MASTER',
                      (activeSubscription as any)?.billingCycle ?? tenantSummary?.billingCycle ?? undefined
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Créditos IA disponíveis</dt>
                  <dd className="mt-1 font-bold text-gray-900 text-sm">{tenantSummary ? tenantSummary.aiCreditsRemaining : '—'}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Tipo de usuário</dt>
                  <dd className="mt-1 font-bold text-gray-900 text-sm capitalize">{user.role}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Membro desde</dt>
                  <dd className="mt-1 font-bold text-gray-900 text-sm">
                    {user.created_at ? new Date(user.created_at).toLocaleDateString('pt-BR') : '—'}
                  </dd>
                </div>
                {lastSignIn && (
                  <div>
                    <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Último acesso</dt>
                    <dd className="mt-1 font-bold text-gray-900 text-sm">
                      {new Date(lastSignIn).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">ID da conta</dt>
                  <dd className="mt-1 text-xs text-gray-400 font-mono">{user.id.slice(0, 8)}…</dd>
                </div>
              </dl>
            </div>
          </div>

        </div>
      )}

      {activeTab === 'team' && (
          <div className="space-y-8">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-lg font-bold flex gap-2 items-center text-gray-800"><School size={20}/> Escolas & Equipe</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      Cadastre sua escola principal e a equipe que vai atuar com você. Depois você pode adicionar outras.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        try {
                          await databaseService.saveSchoolConfigs(user.id, schools);
                          setExpandedSchoolId(null);
                          alert('Escolas salvas!');
                        } catch (e: any) {
                          console.error('[saveSchoolConfigs] erro:', e);
                          alert('Erro ao salvar escolas: ' + (e?.message ?? 'tente novamente.'));
                        }
                      }}
                      className="px-4 py-2 rounded-lg bg-white border border-gray-300 text-gray-700 font-bold text-sm hover:bg-gray-50"
                    >
                      Salvar
                    </button>
                    {onFinishSetup && (
                      <button
                        onClick={async () => {
                          try {
                            await databaseService.saveSchoolConfigs(user.id, schools);
                            setExpandedSchoolId(null);
                            if (isSetupComplete) onFinishSetup();
                            else alert('Preencha pelo menos a Escola principal (nome, gestor e contato).');
                          } catch (e: any) {
                            console.error('[saveSchoolConfigs] erro:', e);
                            alert('Erro ao salvar escolas: ' + (e?.message ?? 'tente novamente.'));
                          }
                        }}
                        className="px-4 py-2 rounded-lg bg-brand-600 text-white font-bold text-sm hover:bg-brand-700"
                      >
                        Concluir e ir para o Dashboard
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid gap-6">
                  {schools.map((s, idx) => {
                    const isExpanded = expandedSchoolId === s.id;
                    return (
                    <div key={s.id} className="rounded-xl border border-gray-200 overflow-hidden">
                      {/* Cabeçalho clicável — toggle expand/collapse */}
                      <div
                        className="bg-gray-50 p-4 border-b border-gray-200 flex items-center justify-between cursor-pointer hover:bg-gray-100 transition-colors select-none"
                        onClick={() => setExpandedSchoolId(isExpanded ? null : s.id)}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-9 h-9 rounded-lg bg-brand-100 text-brand-700 flex items-center justify-center font-bold shrink-0">
                            {idx + 1}
                          </div>
                          <div>
                            <div className="font-bold text-gray-900">{s.schoolName?.trim() ? s.schoolName : 'Escola (clique para preencher)'}</div>
                            <div className="text-[11px] text-gray-500">
                              {idx === 0 && 'Escola principal'}
                              {!isExpanded && s.city?.trim() && ` • ${s.city}`}
                              {!isExpanded && s.managerName?.trim() && ` • ${s.managerName}`}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {idx > 0 && (
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                const updated = schools.filter(x => x.id !== s.id);
                                setSchools(updated);
                                onUpdateUser({ ...user, schoolConfigs: updated });
                                if (expandedSchoolId === s.id) setExpandedSchoolId(null);
                              }}
                              className="text-red-500 hover:bg-red-50 p-2 rounded"
                              title="Remover escola"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                          <ChevronDown
                            size={16}
                            className={`text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                          />
                        </div>
                      </div>

                      {/* Resumo quando recolhido */}
                      {!isExpanded && s.schoolName?.trim() && (
                        <div className="px-4 py-2 bg-white flex flex-wrap gap-4 text-xs text-gray-500 border-t border-gray-100">
                          {s.city && <span><MapPin size={11} className="inline mr-0.5" />{s.city}{s.state ? `, ${s.state}` : ''}</span>}
                          {s.managerName && <span><UserIcon size={11} className="inline mr-0.5" />{s.managerName}</span>}
                          {s.contact && <span><Phone size={11} className="inline mr-0.5" />{s.contact}</span>}
                          {(s.team || []).length > 0 && <span>{(s.team || []).length} profissional(is)</span>}
                        </div>
                      )}

                      {/* Formulário completo — visível apenas quando expandido */}
                      {isExpanded && (
                        <div className="p-4 bg-white">
                          <SchoolForm
                            school={s}
                            onChange={updated => {
                              const list = schools.map(x => x.id === s.id ? updated : x);
                              setSchools(list);
                              onUpdateUser({ ...user, schoolConfigs: list });
                            }}
                          />

                          <div className="mt-5">
                            <div className="text-xs font-bold text-gray-500 uppercase mb-2">Equipe</div>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-4 bg-gray-50 p-3 rounded-lg border border-gray-200">
                              <select className="border p-2 rounded text-sm" value={newMember.role} onChange={e => setNewMember({ ...newMember, role: e.target.value as any })}>
                                <option>Professor Regente</option>
                                <option>AEE</option>
                                <option>Coordenador</option>
                                <option>Pedagogo</option>
                                <option>Gestor</option>
                                <option>Outros</option>
                              </select>
                              <input className="border p-2 rounded text-sm" placeholder="Nome Completo *" value={newMember.name || ''} onChange={e => setNewMember({ ...newMember, name: e.target.value })} />
                              <input className="border p-2 rounded text-sm" placeholder="Email (Opcional)" value={newMember.email || ''} onChange={e => setNewMember({ ...newMember, email: e.target.value })} />
                              <button onClick={() => addTeamMember(s.id)} className="bg-brand-600 text-white rounded text-sm font-bold hover:bg-brand-700 flex items-center justify-center gap-1">
                                <Plus size={14} /> Adicionar
                              </button>
                            </div>
                            <div className="space-y-2">
                              {(s.team || []).length === 0 && <p className="text-sm text-gray-400 italic">Nenhum profissional cadastrado.</p>}
                              {(s.team || []).map(member => (
                                <div key={member.id} className="flex justify-between items-center border-b border-gray-100 pb-2 last:border-0">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-bold text-xs">
                                      {member.name.charAt(0)}
                                    </div>
                                    <div>
                                      <p className="text-sm font-bold text-gray-800">{member.name}</p>
                                      <p className="text-xs text-gray-500">{member.role} {member.email && `• ${member.email}`}</p>
                                    </div>
                                  </div>
                                  <button onClick={() => removeTeamMember(s.id, member.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>

                <div className="flex gap-2 mt-6 max-w-md">
                  <input value={newSchool.schoolName} onChange={e => setNewSchool({ schoolName: e.target.value })} className="border p-2 rounded flex-1" placeholder="Nome da nova escola" />
                  <button onClick={addSchool} className="bg-gray-900 text-white px-4 py-2 rounded font-bold hover:bg-black">Inserir nova escola</button>
                </div>
              </div>
          </div>
      )}

      {activeTab === 'team' && (
        <div className="mt-4 bg-brand-50 border border-brand-100 rounded-xl px-4 py-3 text-xs text-brand-700 flex items-center gap-2">
          <Building2 size={14} />
          <span><strong>Identidade Institucional:</strong> Preencha todos os campos abaixo para que os documentos exportados contenham o cabeçalho oficial da sua escola.</span>
        </div>
      )}

      {activeTab === 'finance' && (
          <div className="space-y-6">

            {/* PLANOS DISPONÍVEIS */}
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
              <h4 className="text-lg font-extrabold text-gray-900 mb-1 flex items-center gap-2">
                <Star size={18} className="text-brand-600" /> Planos
              </h4>
              <p className="text-sm text-gray-500 mb-6">
                Pagamento via Kiwify — PIX, boleto ou cartão.
              </p>

              {/* Se já é PREMIUM, mostra mensagem de plano completo */}
              {isMasterPlan ? (
                <div className="rounded-2xl border-2 border-yellow-400 bg-yellow-50 p-6 flex items-center gap-4">
                  <div className="text-3xl">🏆</div>
                  <div>
                    <div className="font-extrabold text-yellow-800 text-lg">Você tem o plano PREMIUM — o mais completo!</div>
                    <p className="text-sm text-yellow-700 mt-1">
                      Alunos ilimitados · {SUBSCRIPTION_PLANS.MASTER.credits} créditos IA/mês · Todos os recursos liberados
                    </p>
                  </div>
                </div>
              ) : (
                <div className={`grid grid-cols-1 ${isProPlan ? '' : 'md:grid-cols-2'} gap-4`}>
                  {/* PRO — visível apenas para FREE (PRO já sabe que é PRO) */}
                  {!isProPlan && (() => {
                    const btnDisabled = financeBusy;
                    const btnLabel = 'Assinar PRO';
                    return (
                      <div className={`rounded-2xl border-2 p-6 flex flex-col ${isProPlan ? 'border-brand-500 bg-brand-50' : 'border-brand-200'}`}>
                        <div className="flex items-center justify-between mb-3">
                          <span className="font-extrabold text-brand-700 text-lg">PRO</span>
                          {isProPlan
                            ? <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-brand-600 text-white">Plano atual</span>
                            : <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-brand-100 text-brand-700">Popular</span>}
                        </div>
                        <div className="flex items-end gap-2 mb-0.5">
                          <div className="text-3xl font-extrabold text-gray-900">
                            R$ {PLAN_PRICES.PRO_MONTHLY}
                          </div>
                          <div className="text-xs text-gray-500 mb-1.5">/mês</div>
                        </div>
                        <div className="text-xs text-green-700 font-semibold mb-4">
                          ou R$ {PLAN_PRICES.PRO_ANNUAL}/mês no plano anual
                        </div>
                        <ul className="text-sm text-gray-600 space-y-1.5 flex-1">
                          <li>✓ 30 alunos cadastrados</li>
                          <li>✓ {SUBSCRIPTION_PLANS.PRO.credits} créditos IA / mês</li>
                          <li>✓ Triagem com IA</li>
                          <li>✓ PEI, PAEE, PDI, Estudo de Caso completo</li>
                          <li>✓ Perfil cognitivo completo</li>
                          <li>✓ Documentos auditáveis (SHA-256)</li>
                          <li>✓ Exportação PDF profissional</li>
                          <li>✓ Relatórios prontos</li>
                        </ul>
                        <div className="mt-6 flex flex-col gap-2">
                          <button
                            disabled={btnDisabled}
                            onClick={() => handleUpgradeAnnual('PRO')}
                            className="w-full py-2.5 rounded-xl font-bold text-sm bg-brand-700 text-white hover:bg-brand-800 disabled:opacity-60 flex items-center justify-center gap-2 ring-2 ring-brand-400"
                          >
                            <Star size={14} /> Assinar PRO — Anual (melhor preço)
                          </button>
                          <button
                            disabled={btnDisabled}
                            onClick={() => handleUpgrade('PRO')}
                            className="w-full py-2.5 rounded-xl font-bold text-sm border border-brand-400 text-brand-700 hover:bg-brand-50 disabled:opacity-60 flex items-center justify-center gap-2"
                          >
                            <CreditCard size={14} /> Assinar PRO — Mensal
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* PREMIUM */}
                  {(() => {
                    const btnLabel = isProPlan ? 'Fazer upgrade para PREMIUM ↑' : 'Assinar PREMIUM';
                    return (
                      <div className="rounded-2xl border-2 border-yellow-400 bg-yellow-50 p-6 flex flex-col relative overflow-hidden">
                        <div className="absolute top-3 right-3">
                          <span className="text-xs font-bold px-2 py-1 rounded-full bg-yellow-500 text-white">
                            {isProPlan ? 'Recomendado ↑' : 'Completo'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="font-extrabold text-yellow-700 text-lg">PREMIUM</span>
                        </div>
                        <div className="flex items-end gap-2 mb-0.5">
                          <div className="text-3xl font-extrabold text-gray-900">
                            R$ {PLAN_PRICES.MASTER_MONTHLY}
                          </div>
                          <div className="text-xs text-gray-500 mb-1.5">/mês</div>
                        </div>
                        <div className="text-xs text-green-700 font-semibold mb-4">
                          ou R$ {PLAN_PRICES.MASTER_ANNUAL}/mês no plano anual
                        </div>
                        <ul className="text-sm text-gray-600 space-y-1.5 flex-1">
                          <li>✓ Tudo do PRO</li>
                          <li>✓ <strong>Alunos ilimitados</strong></li>
                          <li>✓ <strong>{SUBSCRIPTION_PLANS.MASTER.credits} créditos IA / mês</strong></li>
                          <li>✓ <strong className="text-yellow-700">Análise de laudos com IA (exclusivo)</strong></li>
                          <li>✓ Fichas complementares</li>
                          <li>✓ Controle de atendimento</li>
                          <li>✓ Agendamento de atendimento</li>
                          <li>✓ Modelos personalizados</li>
                          <li>✓ Suporte prioritário</li>
                        </ul>
                        <div className="mt-6 flex flex-col gap-2">
                          <button
                            disabled={financeBusy}
                            onClick={() => handleUpgradeAnnual('MASTER')}
                            className="w-full py-2.5 rounded-xl font-bold text-sm bg-yellow-600 text-white hover:bg-yellow-700 disabled:opacity-60 flex items-center justify-center gap-2 ring-2 ring-yellow-400"
                          >
                            <Star size={14} /> {isProPlan ? 'Upgrade PREMIUM' : 'Assinar PREMIUM'} — Anual (melhor preço)
                          </button>
                          <button
                            disabled={financeBusy}
                            onClick={() => handleUpgrade('MASTER')}
                            className="w-full py-2.5 rounded-xl font-bold text-sm border border-yellow-500 text-yellow-700 hover:bg-yellow-50 disabled:opacity-60 flex items-center justify-center gap-2"
                          >
                            <CreditCard size={14} /> {isProPlan ? 'Upgrade PREMIUM' : 'Assinar PREMIUM'} — Mensal
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

            </div>

            {/* HERO CARD */}
            <div className="bg-gradient-to-br from-white to-brand-50 p-8 rounded-2xl shadow-sm border border-gray-200">
              <div className="flex items-start justify-between gap-6 flex-wrap">
                <div>
                  <h3 className="text-xl font-extrabold text-gray-900 flex items-center gap-2">
                    <CreditCard size={20} className="text-brand-600" /> Financeiro
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">Controle da assinatura, créditos e limites.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    disabled={financeBusy}
                    onClick={openCustomerPortal}
                    className="border border-gray-300 bg-white text-gray-700 px-4 py-2 rounded-xl font-bold hover:bg-gray-50 flex items-center gap-2 disabled:opacity-60"
                  >
                    <Settings size={16} /> Gerenciar cobranças
                  </button>
                  {isFreePlan && (<>
                    <button
                      disabled={financeBusy}
                      onClick={() => handleUpgradeAnnual('PRO')}
                      className="bg-brand-700 text-white px-4 py-2 rounded-xl font-bold shadow hover:bg-brand-800 flex items-center gap-2 disabled:opacity-60 ring-2 ring-brand-400"
                    >
                      <Star size={16} /> Assinar PRO Anual
                    </button>
                    <button
                      disabled={financeBusy}
                      onClick={() => handleUpgrade('PRO')}
                      className="border border-brand-400 text-brand-700 px-4 py-2 rounded-xl font-bold hover:bg-brand-50 flex items-center gap-2 disabled:opacity-60"
                    >
                      <CreditCard size={16} /> PRO Mensal
                    </button>
                  </>)}
                  {isProPlan && (<>
                    <button
                      disabled={financeBusy}
                      onClick={() => handleUpgradeAnnual('MASTER')}
                      className="bg-yellow-600 text-white px-4 py-2 rounded-xl font-bold shadow hover:bg-yellow-700 flex items-center gap-2 disabled:opacity-60 ring-2 ring-yellow-400"
                    >
                      <Star size={16} /> Upgrade PREMIUM Anual
                    </button>
                    <button
                      disabled={financeBusy}
                      onClick={() => handleUpgrade('MASTER')}
                      className="border border-yellow-500 text-yellow-700 px-4 py-2 rounded-xl font-bold hover:bg-yellow-50 flex items-center gap-2 disabled:opacity-60"
                    >
                      <CreditCard size={16} /> PREMIUM Mensal
                    </button>
                  </>)}
                </div>
              </div>

              {financeError && (
                <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700">
                  {financeError}
                </div>
              )}

              <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Card: Status da Assinatura */}
                <div className="p-4 rounded-2xl bg-white border border-gray-200">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs uppercase font-extrabold text-gray-500">Status</span>
                    <SubscriptionStatusBadge status={subscriptionStatus} size="sm" />
                  </div>
                  <div className="text-2xl font-extrabold text-gray-900">
                    {formatPlanDisplayName(
                      isFreePlan ? 'FREE' : isProPlan ? 'PRO' : 'MASTER',
                      (activeSubscription as any)?.billingCycle ?? tenantSummary?.billingCycle ?? undefined
                    )}
                  </div>
                  {expiryDate ? (
                    <p className={`text-xs mt-1 font-semibold ${needsPayment ? 'text-red-600' : 'text-gray-500'}`}>
                      {needsPayment ? 'Vencido em: ' : 'Renova em: '}
                      {new Date(expiryDate).toLocaleDateString('pt-BR')}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400 mt-1">Sem data de vencimento</p>
                  )}
                </div>

                {/* Card: Créditos IA */}
                <div className="p-4 rounded-2xl bg-white border border-gray-200">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs uppercase font-extrabold text-gray-500">Créditos IA</span>
                    <button
                      onClick={() => setShowLedger(v => !v)}
                      className="text-xs text-brand-600 hover:underline"
                    >
                      {showLedger ? 'Ocultar' : 'Ver histórico'}
                    </button>
                  </div>
                  <div className="text-3xl font-extrabold text-gray-900">
                    {tenantSummary ? tenantSummary.aiCreditsRemaining : '—'}
                    <span className="text-sm font-normal text-gray-400 ml-1">disponíveis</span>
                  </div>
                  {monthlyCredits > 0 ? (
                    <div className="mt-1 space-y-0.5">
                      <p className="text-xs text-gray-500">
                        <span className="font-semibold text-gray-700">{monthlyCredits}</span> créditos/mês no plano
                        {tenantSummary && (
                          <> · <span className="font-semibold text-red-600">
                            {tenantSummary.creditsConsumedCycle} consumidos
                          </span></>
                        )}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 mt-1">Plano FREE — {SUBSCRIPTION_PLANS.FREE.credits} créditos/mês</p>
                  )}
                  {tenantSummary?.renewalDateCredits && (() => {
                    const end = new Date(tenantSummary.renewalDateCredits);
                    const start = new Date(end);
                    start.setDate(start.getDate() - 30);
                    return (
                      <p className="text-xs text-gray-500 mt-1 font-medium">
                        Ciclo: {start.toLocaleDateString('pt-BR')} → {end.toLocaleDateString('pt-BR')}
                      </p>
                    );
                  })()}
                </div>

                {/* Card: Alunos */}
                {(() => {
                  const limitBase = tenantSummary?.studentLimitBase ?? 0;
                  const isUnlimited = limitBase >= 9999;
                  const limitLabel = isUnlimited ? 'Ilimitado' : formatStudentLimit(totalStudentLimit ?? limitBase);
                  return (
                    <div className="p-4 rounded-2xl bg-white border border-gray-200">
                      <span className="text-xs uppercase font-extrabold text-gray-500">Alunos ativos</span>
                      <div className="mt-2 text-3xl font-extrabold text-gray-900">
                        {tenantSummary ? `${tenantSummary.studentsActive} / ${limitLabel}` : '—'}
                      </div>
                      {tenantSummary && !isUnlimited && (
                        <div className="mt-2 w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="h-1.5 rounded-full bg-brand-500"
                            style={{
                              width: totalStudentLimit
                                ? `${Math.min(100, (tenantSummary.studentsActive / totalStudentLimit) * 100)}%`
                                : '0%',
                            }}
                          />
                        </div>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        {isUnlimited ? 'Sem limite de alunos no plano PREMIUM' : `Limite: ${limitLabel}`}
                      </p>
                    </div>
                  );
                })()}
              </div>

              {/* Histórico de créditos */}
              {showLedger && creditLedger.length > 0 && (
                <div className="mt-4 border border-gray-200 rounded-2xl overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 text-xs font-bold text-gray-500 uppercase">
                    Histórico de créditos (últimas 20 movimentações)
                  </div>
                  <div className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
                    {creditLedger.map(entry => (
                      <div key={entry.id} className="flex items-center justify-between px-4 py-2">
                        <div>
                          <p className="text-xs font-medium text-gray-700">{entry.description ?? entry.type}</p>
                          <p className="text-[10px] text-gray-400">{new Date(entry.created_at).toLocaleString('pt-BR')}</p>
                        </div>
                        <span className={`text-sm font-extrabold ${entry.amount > 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {entry.amount > 0 ? '+' : ''}{entry.amount}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Banner: Pagamento em atraso ou cancelado */}
              {needsPayment && (
                <div className={`mt-4 p-4 rounded-2xl flex items-center justify-between gap-4 flex-wrap ${
                  isCanceled
                    ? 'bg-red-50 border border-red-200'
                    : 'bg-yellow-50 border border-yellow-200'
                }`}>
                  <div>
                    <p className={`font-extrabold ${isCanceled ? 'text-red-900' : 'text-yellow-900'}`}>
                      {isCanceled ? 'Assinatura cancelada' : 'Pagamento em atraso'}
                    </p>
                    <p className={`text-sm mt-0.5 ${isCanceled ? 'text-red-700' : 'text-yellow-800'}`}>
                      {isCanceled
                        ? 'Reative sua assinatura para continuar usando os recursos premium.'
                        : 'Regularize o pagamento para manter o acesso completo ao sistema.'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      disabled={financeBusy}
                      onClick={handlePayNow}
                      className={`px-4 py-2 rounded-xl font-bold flex items-center gap-2 disabled:opacity-60 text-white ${
                        isCanceled ? 'bg-red-600 hover:bg-red-700' : 'bg-yellow-600 hover:bg-yellow-700'
                      }`}
                    >
                      {financeBusy ? <RefreshCw size={15} className="animate-spin" /> : <CreditCard size={15} />}
                      {isCanceled ? 'Reativar agora' : 'Pagar agora'}
                    </button>
                    <button
                      disabled={financeBusy}
                      onClick={openCustomerPortal}
                      className="px-4 py-2 rounded-xl font-bold border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 flex items-center gap-2 disabled:opacity-60"
                    >
                      <ExternalLink size={15} /> Atualizar pagamento
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ADD-ONS */}
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h4 className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
                    <ShoppingCart size={18} className="text-brand-600" /> Pacotes extras
                  </h4>
                  <p className="text-sm text-gray-600 mt-1">Compre créditos IA e/ou amplie limite de alunos sem trocar de plano.</p>
                </div>
                <div className="text-xs text-gray-500">
                  * Checkout via Kiwify (PIX/Boleto/Cartão)
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                {DEFAULT_ADDONS.map(p => (
                  <div key={p.sku} className={`p-4 rounded-2xl border ${p.recommended ? 'border-brand-200 bg-brand-50' : 'border-gray-200 bg-white'}`}>
                    <div className="flex items-center justify-between">
                      <div className="font-extrabold text-gray-900">{p.title}</div>
                      {p.recommended && (
                        <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full bg-brand-600 text-white">
                          <Sparkles size={14} /> Recomendado
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{p.description}</p>
                    <div className="mt-3 text-2xl font-extrabold text-gray-900">
                      {(p.priceCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </div>
                    <button
                      disabled={financeBusy || !tenantSummary}
                      onClick={() => buyAddOn(p)}
                      className="mt-4 w-full bg-gray-900 text-white py-3 rounded-xl font-bold hover:bg-black flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      <ShoppingCart size={16} /> Comprar
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-6 p-4 rounded-2xl bg-gray-50 border border-gray-200">
                <p className="text-sm text-gray-700">
                  <span className="font-bold">Dica:</span> Se você for usar o sistema em grupo, o mais rápido é comprar <b>alunos extras</b>.
                  Se for uso individual, normalmente <b>créditos IA</b> resolvem.
                </p>
              </div>
            </div>


          </div>
      )}
    </div>
  );
};

// ─── Componente de formulário institucional da escola ─────────────────────────
interface SchoolFormProps {
  school: SchoolConfig;
  onChange: (updated: SchoolConfig) => void;
}

// SchoolField é definido FORA de SchoolForm para evitar remount a cada keystroke.
// Quando um componente é declarado dentro de outro, o React o trata como um tipo
// diferente a cada render, desmontando e remontando o input, o que faz o foco sair.
interface SchoolFieldProps {
  label: string;
  field: keyof SchoolConfig;
  placeholder?: string;
  required?: boolean;
  school: SchoolConfig;
  onChange: (updated: SchoolConfig) => void;
}
const SchoolField: React.FC<SchoolFieldProps> = ({ label, field, placeholder, required, school, onChange }) => (
  <div>
    <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    <input
      value={(school[field] as string) || ''}
      onChange={e => onChange({ ...school, [field]: e.target.value })}
      placeholder={placeholder}
      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
    />
  </div>
);

const SchoolForm: React.FC<SchoolFormProps> = ({ school, onChange }) => {
  const logoRef = useRef<HTMLInputElement>(null);
  const [inepLoading, setInepLoading] = useState(false);
  const [inepStatus, setInepStatus] = useState<'idle' | 'found' | 'not_found' | 'invalid' | 'network'>('idle');
  const [cepLoading, setCepLoading] = useState(false);
  const [cepStatus, setCepStatus] = useState<'idle' | 'found' | 'not_found'>('idle');

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return alert('Selecione uma imagem (PNG, JPG, SVG).');
    if (file.size > 1024 * 1024 * 2) return alert('Imagem muito grande. Use até 2 MB.');
    const reader = new FileReader();
    reader.onloadend = () => onChange({ ...school, logoUrl: reader.result as string });
    reader.readAsDataURL(file);
  };

  const handleCepBlur = async (rawCep: string) => {
    const digits = normalizeCep(rawCep);
    if (!validateCep(digits)) return; // menos de 8 dígitos — aguarda
    setCepLoading(true);
    setCepStatus('idle');
    try {
      const data = await fetchAddressByCep(digits);
      if (data) {
        onChange({
          ...school,
          zipcode:      formatCep(digits),
          address:      data.logradouro  || school.address,
          neighborhood: data.bairro      || school.neighborhood,
          city:         data.localidade  || school.city,
          state:        data.uf          || school.state,
        });
        setCepStatus('found');
      } else {
        setCepStatus('not_found');
      }
    } catch {
      setCepStatus('not_found');
    } finally {
      setCepLoading(false);
    }
  };

  const handleFetchINEP = async (codeOverride?: string) => {
    const code = (codeOverride ?? school.inepCode ?? '').replace(/\D/g, '');
    if (!validateINEPCode(code)) {
      setInepStatus('invalid');
      return;
    }
    setInepLoading(true);
    setInepStatus('idle');
    try {
      const data = await fetchSchoolByINEP(code);
      if (data) {
        onChange({
          ...school,
          schoolName:   data.schoolName   || school.schoolName,
          address:      data.address      || school.address,
          neighborhood: data.neighborhood || school.neighborhood,
          city:         data.city         || school.city,
          state:        data.state        || school.state,
          zipcode:      data.zipcode      || school.zipcode,
          contact:      data.contact      || school.contact,
        });
        setInepStatus('found');
      } else {
        setInepStatus('not_found');
      }
    } catch (e: any) {
      const errType: INEPFetchError = e?.type ?? 'not_found';
      setInepStatus(errType === 'network' ? 'network' : 'not_found');
    } finally {
      setInepLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Logo + Nome */}
      <div className="flex gap-5 items-start">
        <div>
          <label className="block text-[11px] font-bold text-gray-500 uppercase mb-2">Logo da Escola</label>
          <div
            onClick={() => logoRef.current?.click()}
            className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 flex flex-col items-center justify-center cursor-pointer hover:border-brand-400 hover:bg-brand-50 transition overflow-hidden"
          >
            {school.logoUrl ? (
              <img src={school.logoUrl} alt="logo" className="w-full h-full object-contain" />
            ) : (
              <>
                <Upload size={18} className="text-gray-400" />
                <span className="text-[9px] text-gray-400 mt-1 text-center">PNG/JPG<br/>até 2 MB</span>
              </>
            )}
          </div>
          <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
          {school.logoUrl && (
            <button onClick={() => onChange({ ...school, logoUrl: '' })}
              className="mt-1 text-[10px] text-red-500 hover:underline">Remover logo</button>
          )}
        </div>
        <div className="flex-1">
          <SchoolField school={school} onChange={onChange}label="Nome da Escola" field="schoolName" placeholder="Ex: Escola Municipal Tocantins" required />
        </div>
      </div>

      {/* Seção: Identificadores Oficiais */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Hash size={13} className="text-brand-600" />
          <span className="text-[11px] font-bold text-gray-500 uppercase">Identificadores Oficiais</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SchoolField school={school} onChange={onChange}label="CNPJ" field="cnpj" placeholder="00.000.000/0000-00" required />

          {/* INEP com botão de busca automática */}
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
              Código INEP
            </label>
            <div className="flex gap-2">
              <input
                value={(school.inepCode as string) || ''}
                onChange={e => {
                  // Aceita apenas dígitos, máx 8 caracteres
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 8);
                  onChange({ ...school, inepCode: digits });
                  setInepStatus('idle');
                  // Auto-busca quando os 8 dígitos forem preenchidos
                  if (digits.length === 8) handleFetchINEP(digits);
                }}
                placeholder="Ex: 12345678"
                maxLength={8}
                inputMode="numeric"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
              />
              <button
                type="button"
                onClick={() => handleFetchINEP()}
                disabled={inepLoading}
                title="Buscar dados da escola pelo código INEP"
                className="flex items-center gap-1.5 px-3 py-2 bg-brand-600 text-white rounded-lg text-xs font-bold hover:bg-brand-700 disabled:opacity-60 whitespace-nowrap"
              >
                {inepLoading ? (
                  <RefreshCw size={13} className="animate-spin" />
                ) : (
                  <Search size={13} />
                )}
                {inepLoading ? 'Buscando...' : 'Buscar'}
              </button>
            </div>
            {inepStatus === 'found' && (
              <p className="mt-1 text-[11px] text-green-600 flex items-center gap-1">
                <CheckCircle size={11} /> Dados preenchidos automaticamente. Confira e ajuste se necessário.
              </p>
            )}
            {inepStatus === 'not_found' && (
              <p className="mt-1 text-[11px] text-amber-600">
                Escola não encontrada nas fontes consultadas. Preencha os dados manualmente abaixo.
              </p>
            )}
            {inepStatus === 'invalid' && (
              <p className="mt-1 text-[11px] text-red-500">
                Código INEP deve ter exatamente 8 dígitos.
              </p>
            )}
            {inepStatus === 'network' && (
              <p className="mt-1 text-[11px] text-red-500">
                Sem conexão com as fontes INEP. Verifique sua internet ou preencha manualmente.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Seção: Localização */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <MapPin size={13} className="text-brand-600" />
          <span className="text-[11px] font-bold text-gray-500 uppercase">Endereço</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <SchoolField school={school} onChange={onChange}label="Logradouro e número" field="address" placeholder="Rua, número, complemento" />
          </div>
          <SchoolField school={school} onChange={onChange}label="Bairro" field="neighborhood" placeholder="Bairro" />
          {/* CEP com auto-preenchimento via ViaCEP */}
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">CEP</label>
            <div className="relative">
              <input
                type="text"
                value={school.zipcode || ''}
                onChange={e => {
                  onChange({ ...school, zipcode: e.target.value });
                  setCepStatus('idle');
                }}
                onBlur={e => handleCepBlur(e.target.value)}
                placeholder="00000-000"
                maxLength={9}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 pr-8"
              />
              {cepLoading && (
                <span className="absolute right-2 top-2.5 text-[10px] text-brand-500 animate-pulse">●</span>
              )}
            </div>
            {cepStatus === 'found' && (
              <p className="text-[10px] text-green-600 mt-0.5 font-semibold">✓ Endereço preenchido pelo CEP</p>
            )}
            {cepStatus === 'not_found' && (
              <p className="text-[10px] text-orange-500 mt-0.5">CEP não encontrado. Preencha manualmente.</p>
            )}
          </div>
          <SchoolField school={school} onChange={onChange}label="Cidade" field="city" placeholder="Cidade" required />
          <SchoolField school={school} onChange={onChange}label="Estado (UF)" field="state" placeholder="Ex: TO" />
        </div>
      </div>

      {/* Seção: Contato */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Phone size={13} className="text-brand-600" />
          <span className="text-[11px] font-bold text-gray-500 uppercase">Contato</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SchoolField school={school} onChange={onChange}label="E-mail Institucional" field="email" placeholder="escola@email.com.br" required />
          <SchoolField school={school} onChange={onChange}label="Telefone / WhatsApp" field="contact" placeholder="(00) 00000-0000" />
          <SchoolField school={school} onChange={onChange}label="Instagram (opcional)" field="instagram" placeholder="@escola" />
        </div>
      </div>

      {/* Seção: Responsáveis */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <UserIcon size={13} className="text-brand-600" />
          <span className="text-[11px] font-bold text-gray-500 uppercase">Responsáveis</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SchoolField school={school} onChange={onChange}label="Diretor(a) / Principal" field="principalName" placeholder="Nome do(a) Diretor(a)" />
          <SchoolField school={school} onChange={onChange}label="Gestor(a)" field="managerName" placeholder="Nome do(a) Gestor(a)" required />
          <SchoolField school={school} onChange={onChange}label="Coordenador(a)" field="coordinatorName" placeholder="Nome do(a) Coordenador(a)" />
          <SchoolField school={school} onChange={onChange}label="Representante AEE" field="aeeRepresentative" placeholder="Nome / Setor AEE" />
        </div>
      </div>
    </div>
  );
};
