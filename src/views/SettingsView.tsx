import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AddOnProduct, TenantSummary, User, SchoolConfig, PlanTier, TeamMember } from '../types';
import { Plus, Trash2, School, User as UserIcon, CreditCard, Star, Settings, Sparkles, AlertTriangle, ShoppingCart, Upload, Building2, MapPin, Phone, Hash, FileText, AlertCircle, ChevronDown, RefreshCw, ExternalLink, Search, CheckCircle, Gift, Copy, Share2, Users } from 'lucide-react';
import { ReferralService, type ReferralStats } from '../services/referralService';
import { fetchSchoolByINEP, validateINEPCode } from '../services/inepService';
import { fetchAddressByCep, validateCep, normalizeCep, formatCep } from '../services/cepService';
import { PaymentService, DEFAULT_ADDONS } from '../services/paymentService';
import { databaseService } from '../services/databaseService';
import { SubscriptionStatusBadge } from '../components/SubscriptionStatusBadge';
import { CreditWalletService, CreditLedgerService } from '../services/creditService';
import type { CreditLedgerEntry } from '../types';
import { getActiveSubscription, type ActiveSubscriptionInfo } from '../services/subscriptionService';
import {
  AsaasPaymentService,
  AsaasCustomerService,
  AsaasSubscriptionService,
  isAsaasConfigured,
  ASAAS_PLAN_PRICES,
} from '../services/asaasService';

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
  const [email, setEmail] = useState(user.email);
  const [profilePhoto, setProfilePhoto] = useState<string | undefined>(user.profilePhoto);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [schools, setSchools] = useState<SchoolConfig[]>(user.schoolConfigs);
  const [newSchool, setNewSchool] = useState<Partial<SchoolConfig>>({ schoolName: '' });
  // ID da escola com formulário expandido; null = todos recolhidos
  const [expandedSchoolId, setExpandedSchoolId] = useState<string | null>(
    () => user.schoolConfigs.find(s => !s.schoolName?.trim())?.id ?? null
  );

  const [newMember, setNewMember] = useState<Partial<TeamMember>>({ role: 'Professor Regente' });

  const handleSaveProfile = async () => {
    try {
      await databaseService.updateUserProfile(user.id, { name, email });
      await databaseService.saveSchoolConfigs(user.id, schools);
      onUpdateUser({ ...user, name, email, schoolConfigs: schools, profilePhoto });
      setExpandedSchoolId(null);
      alert('Configurações salvas com sucesso!');
    } catch (e: any) {
      alert(e?.message || 'Erro ao salvar configurações');
    }
  };

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

  // Referral
  const [referralStats, setReferralStats]   = useState<ReferralStats | null>(null);
  const [refLoading, setRefLoading]         = useState(false);
  const [refCopied, setRefCopied]           = useState(false);
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
            const [ledger, sub] = await Promise.all([
              CreditLedgerService.getHistory(summary.tenantId, 20),
              getActiveSubscription(summary.tenantId).catch(() => null),
            ]);
            if (alive) setCreditLedger(ledger);
            if (alive) setActiveSubscription(sub);
          } catch { /* silencioso */ }
        }
        // Carrega dados de indicação
        if (alive) {
          setRefLoading(true);
          try {
            const code  = await ReferralService.getOrCreateReferralCode(user.id);
            const stats = await ReferralService.getStats(user.id);
            if (alive) setReferralStats({ ...stats, referralCode: code });
          } catch { /* silencioso */ } finally {
            if (alive) setRefLoading(false);
          }
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
      if (isAsaasConfigured()) {
        // Fluxo Asaas: cria cliente → cria assinatura → redireciona para pagamento
        const customerId = await AsaasCustomerService.createOrGet(tenantSummary.tenantId, {
          name:              user.name || user.email,
          email:             user.email,
          externalReference: tenantSummary.tenantId,
        });

        const today    = new Date().toISOString().split('T')[0];
        const price    = ASAAS_PLAN_PRICES[planCode] ?? 79.90;
        const { paymentLink } = await AsaasSubscriptionService.create(
          tenantSummary.tenantId,
          planCode,
          {
            customerId,
            billingType:       'PIX',
            value:             price,
            nextDueDate:       today,
            cycle:             'MONTHLY',
            description:       `IncluiAI ${planCode} - Assinatura Mensal`,
            externalReference: tenantSummary.tenantId,
          }
        );
        window.open(paymentLink, '_blank', 'noopener,noreferrer');
      } else {
        // Fallback Kiwify (mock) enquanto Asaas não está configurado
        const planTier = planCode === 'MASTER' ? PlanTier.PREMIUM : PlanTier.PRO;
        const url = await PaymentService.getCheckoutUrl(planTier, user);
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (e: any) {
      alert(e?.message || 'Não foi possível iniciar o checkout. Verifique as configurações do Asaas.');
    } finally {
      setFinanceBusy(false);
    }
  };

  const openCustomerPortal = async () => {
    try {
      setFinanceBusy(true);
      // Prioriza link de atualização do gateway (Asaas) se disponível
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

      if (activeSubscription?.billingProvider === 'asaas' && activeSubscription.providerCustomerId && product.kind === 'AI_CREDITS') {
        // Asaas: cria cobrança avulsa e retorna link de pagamento PIX/boleto
        const result = await AsaasPaymentService.createExtraCreditsPayment({
          tenantId: tenantSummary.tenantId,
          customerId: activeSubscription.providerCustomerId,
          credits: product.quantity,
          pricePerCredit: Math.round(product.priceCents / product.quantity) / 100,
        });
        url = result.invoiceUrl;
      } else {
        // Kiwify (fallback padrão)
        url = await PaymentService.getAddOnCheckoutUrl(product.sku, user, {
          qty: String(product.quantity),
          kind: product.kind,
        });
      }

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
  const handlePayNow = async () => {
    setFinanceBusy(true);
    try {
      // Prioridade: link direto do gateway (Asaas) > Kiwify fallback
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
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
              <h3 className="text-lg font-bold mb-6 flex gap-2 items-center text-gray-800"><UserIcon size={20}/> Seus Dados</h3>
              <div className="flex items-start gap-6 mb-6">
                <div className="flex flex-col items-center gap-2">
                  <div
                    onClick={() => photoInputRef.current?.click()}
                    className="w-20 h-20 rounded-full border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center cursor-pointer hover:border-brand-400 transition overflow-hidden shrink-0"
                  >
                    {profilePhoto ? (
                      <img src={profilePhoto} alt="foto" className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center">
                        <Upload size={18} className="text-gray-400" />
                        <span className="text-[9px] text-gray-400 mt-0.5">Foto</span>
                      </div>
                    )}
                  </div>
                  <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                  {profilePhoto && (
                    <button onClick={() => setProfilePhoto(undefined)} className="text-[10px] text-red-500 hover:underline">
                      Remover
                    </button>
                  )}
                </div>
                <div className="space-y-4 flex-1 max-w-md">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nome</label>
                      <input value={name} onChange={e => setName(e.target.value)} className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" placeholder="Seu nome completo"/>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">E-mail</label>
                      <input value={email} onChange={e => setEmail(e.target.value)} className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" placeholder="seu@email.com"/>
                    </div>
                    <button onClick={handleSaveProfile} className="bg-brand-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-brand-700 transition">
                      Salvar alterações
                    </button>
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
                        await databaseService.saveSchoolConfigs(user.id, schools);
                        setExpandedSchoolId(null);
                        alert('Escolas salvas!');
                      }}
                      className="px-4 py-2 rounded-lg bg-white border border-gray-300 text-gray-700 font-bold text-sm hover:bg-gray-50"
                    >
                      Salvar
                    </button>
                    {onFinishSetup && (
                      <button
                        onClick={async () => {
                          await databaseService.saveSchoolConfigs(user.id, schools);
                          setExpandedSchoolId(null);
                          if (isSetupComplete) onFinishSetup();
                          else alert('Preencha pelo menos a Escola principal (nome, gestor e contato).');
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
                {isAsaasConfigured()
                  ? 'Pagamento via PIX, boleto ou cartão — processado pelo Asaas.'
                  : 'Configure VITE_ASAAS_API_KEY no .env para ativar o checkout.'}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* FREE */}
                {(() => {
                  const isCurrent = (tenantSummary?.planTier ?? user.plan) === PlanTier.FREE
                    || String(tenantSummary?.planTier ?? '').toUpperCase() === 'FREE';
                  return (
                    <div className={`rounded-2xl border-2 p-6 flex flex-col ${isCurrent ? 'border-gray-400 bg-gray-50' : 'border-gray-200'}`}>
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-extrabold text-gray-800 text-lg">Grátis</span>
                        {isCurrent && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-700">Plano atual</span>}
                      </div>
                      <div className="text-3xl font-extrabold text-gray-900 mb-1">R$ 0</div>
                      <div className="text-xs text-gray-500 mb-4">por mês</div>
                      <ul className="text-sm text-gray-600 space-y-1.5 flex-1">
                        <li>✓ 5 alunos cadastrados</li>
                        <li>✓ Documentos PDF básicos</li>
                        <li className="text-gray-400">✗ Créditos IA</li>
                        <li className="text-gray-400">✗ Código de auditoria</li>
                      </ul>
                      <button disabled className="mt-6 w-full py-2.5 rounded-xl font-bold text-sm bg-gray-100 text-gray-400 cursor-not-allowed">
                        Plano base
                      </button>
                    </div>
                  );
                })()}

                {/* PRO */}
                {(() => {
                  const isCurrent = String(tenantSummary?.planTier ?? '').toUpperCase() === 'PRO';
                  return (
                    <div className={`rounded-2xl border-2 p-6 flex flex-col ${isCurrent ? 'border-brand-500 bg-brand-50' : 'border-brand-200'}`}>
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-extrabold text-brand-700 text-lg">PRO</span>
                        {isCurrent
                          ? <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-brand-600 text-white">Plano atual</span>
                          : <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-brand-100 text-brand-700">Popular</span>}
                      </div>
                      <div className="text-3xl font-extrabold text-gray-900 mb-1">
                        R$ {ASAAS_PLAN_PRICES.PRO.toFixed(2).replace('.', ',')}
                      </div>
                      <div className="text-xs text-gray-500 mb-4">por mês</div>
                      <ul className="text-sm text-gray-600 space-y-1.5 flex-1">
                        <li>✓ 30 alunos cadastrados</li>
                        <li>✓ 50 créditos IA / mês</li>
                        <li>✓ Código de auditoria SHA-256</li>
                        <li>✓ Exportação PDF profissional</li>
                      </ul>
                      <button
                        disabled={financeBusy || isCurrent}
                        onClick={() => handleUpgrade('PRO')}
                        className="mt-6 w-full py-2.5 rounded-xl font-bold text-sm bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-60 flex items-center justify-center gap-2"
                      >
                        {financeBusy ? <RefreshCw size={14} className="animate-spin" /> : <CreditCard size={14} />}
                        {isCurrent ? 'Plano ativo' : 'Assinar PRO'}
                      </button>
                    </div>
                  );
                })()}

                {/* MASTER */}
                {(() => {
                  const isCurrent = ['MASTER', 'PREMIUM', 'INSTITUTIONAL'].includes(
                    String(tenantSummary?.planTier ?? '').toUpperCase()
                  );
                  return (
                    <div className={`rounded-2xl border-2 p-6 flex flex-col ${isCurrent ? 'border-yellow-500 bg-yellow-50' : 'border-yellow-200'}`}>
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-extrabold text-yellow-700 text-lg">MASTER</span>
                        {isCurrent
                          ? <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-yellow-500 text-white">Plano atual</span>
                          : <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800">Institucional</span>}
                      </div>
                      <div className="text-3xl font-extrabold text-gray-900 mb-1">
                        R$ {ASAAS_PLAN_PRICES.MASTER.toFixed(2).replace('.', ',')}
                      </div>
                      <div className="text-xs text-gray-500 mb-4">por mês</div>
                      <ul className="text-sm text-gray-600 space-y-1.5 flex-1">
                        <li>✓ 999 alunos cadastrados</li>
                        <li>✓ 70 créditos IA / mês</li>
                        <li>✓ Controle de presença</li>
                        <li>✓ Todas as funcionalidades</li>
                      </ul>
                      <button
                        disabled={financeBusy || isCurrent}
                        onClick={() => handleUpgrade('MASTER')}
                        className="mt-6 w-full py-2.5 rounded-xl font-bold text-sm bg-yellow-600 text-white hover:bg-yellow-700 disabled:opacity-60 flex items-center justify-center gap-2"
                      >
                        {financeBusy ? <RefreshCw size={14} className="animate-spin" /> : <CreditCard size={14} />}
                        {isCurrent ? 'Plano ativo' : 'Assinar MASTER'}
                      </button>
                    </div>
                  );
                })()}
              </div>

              {!isAsaasConfigured() && (
                <div className="mt-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
                  <AlertTriangle size={14} className="shrink-0" />
                  Asaas não configurado. Defina <code className="font-mono bg-amber-100 px-1 rounded">VITE_ASAAS_API_KEY</code> no arquivo <code className="font-mono bg-amber-100 px-1 rounded">.env</code> e reinicie o servidor.
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
                  {user.plan === PlanTier.FREE && (
                    <button
                      disabled={financeBusy}
                      onClick={() => handleUpgrade('PRO')}
                      className="bg-brand-600 text-white px-4 py-2 rounded-xl font-bold shadow hover:bg-brand-700 flex items-center gap-2 disabled:opacity-60"
                    >
                      <Star size={16} /> Virar PRO
                    </button>
                  )}
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
                    {tenantSummary?.planTier ? tenantSummary.planTier : user.plan}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {tenantSummary?.renewalDatePlan
                      ? `Renovação: ${new Date(tenantSummary.renewalDatePlan).toLocaleDateString('pt-BR')}`
                      : 'Sem data de renovação'}
                  </p>
                  {(user as any).nextDueDate && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      Vencimento: {new Date((user as any).nextDueDate).toLocaleDateString('pt-BR')}
                    </p>
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
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Renovação: {tenantSummary?.renewalDateCredits
                      ? new Date(tenantSummary.renewalDateCredits).toLocaleDateString('pt-BR')
                      : '—'}
                  </p>
                </div>

                {/* Card: Alunos */}
                <div className="p-4 rounded-2xl bg-white border border-gray-200">
                  <span className="text-xs uppercase font-extrabold text-gray-500">Alunos ativos</span>
                  <div className="mt-2 text-3xl font-extrabold text-gray-900">
                    {tenantSummary ? `${tenantSummary.studentsActive}/${totalStudentLimit ?? '—'}` : '—'}
                  </div>
                  {tenantSummary && (
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
                    Base: {tenantSummary?.studentLimitBase ?? '—'} • Extras: {tenantSummary?.studentLimitExtra ?? '—'}
                  </p>
                </div>
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
                  {isAsaasConfigured() ? '* Checkout via Asaas (PIX/Boleto/Cartão)' : '* Configure Asaas para habilitar'}
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

            {/* INDIQUE E GANHE */}
            {(() => {
              const refCode = referralStats?.referralCode ?? '';
              const refLink = refCode ? ReferralService.getReferralLink(refCode) : '';
              const waText  = encodeURIComponent(
                `Olá! Estou usando o IncluiAI para criar documentos pedagógicos com IA (PEI, PAEE, PDI). ` +
                `Experimente grátis: ${refLink}`
              );

              const handleCopy = async () => {
                if (!refLink) return;
                await navigator.clipboard.writeText(refLink);
                setRefCopied(true);
                setTimeout(() => setRefCopied(false), 2000);
              };

              return (
                <div className="bg-gradient-to-br from-[#1F4E5F] to-[#2E3A59] p-8 rounded-2xl shadow-sm text-white">
                  <div className="flex items-start gap-4 mb-6">
                    <div className="bg-white/10 p-3 rounded-2xl shrink-0">
                      <Gift size={24} className="text-[#C69214]" />
                    </div>
                    <div>
                      <h4 className="text-lg font-extrabold flex items-center gap-2">
                        🎁 Indique e Ganhe Créditos IA
                      </h4>
                      <p className="text-sm text-white/70 mt-1">
                        Convide colegas para usar o IncluiAI. Quando alguém assinar um plano usando seu link,
                        você ganha créditos IA automaticamente.
                      </p>
                    </div>
                  </div>

                  {/* Recompensas */}
                  <div className="grid grid-cols-2 gap-3 mb-6">
                    <div className="bg-white/10 rounded-xl p-4 text-center">
                      <div className="text-2xl font-extrabold text-[#C69214]">10</div>
                      <div className="text-xs text-white/70 mt-1">créditos ao indicar<br/>quem assina o PRO</div>
                    </div>
                    <div className="bg-white/10 rounded-xl p-4 text-center">
                      <div className="text-2xl font-extrabold text-[#C69214]">20</div>
                      <div className="text-xs text-white/70 mt-1">créditos ao indicar<br/>quem assina o MASTER</div>
                    </div>
                  </div>

                  {/* Código e link */}
                  {refLoading ? (
                    <div className="flex items-center gap-2 text-white/60 text-sm">
                      <RefreshCw size={14} className="animate-spin" /> Gerando seu código…
                    </div>
                  ) : refCode ? (
                    <>
                      <div className="mb-3">
                        <p className="text-xs font-bold text-white/50 uppercase mb-1">Seu código de indicação</p>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xl font-extrabold tracking-widest text-[#C69214]">
                            {refCode}
                          </span>
                        </div>
                      </div>

                      <div className="bg-white/10 rounded-xl px-4 py-3 mb-4">
                        <p className="text-xs text-white/50 mb-1">Seu link único</p>
                        <p className="text-sm font-mono text-white/90 break-all">{refLink}</p>
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <button
                          onClick={handleCopy}
                          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm bg-white text-[#1F4E5F] hover:bg-white/90 transition"
                        >
                          {refCopied ? <CheckCircle size={16} className="text-green-600" /> : <Copy size={16} />}
                          {refCopied ? 'Copiado!' : 'Copiar link'}
                        </button>
                        <a
                          href={`https://wa.me/?text=${waText}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm bg-green-500 text-white hover:bg-green-600 transition"
                        >
                          <Share2 size={16} /> Compartilhar no WhatsApp
                        </a>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-white/50">Não foi possível carregar seu código. Recarregue a página.</p>
                  )}

                  {/* Stats */}
                  {referralStats && (referralStats.totalReferrals > 0 || referralStats.creditsEarned > 0) && (
                    <div className="mt-6 pt-6 border-t border-white/10 grid grid-cols-2 gap-4">
                      <div className="flex items-center gap-3">
                        <div className="bg-white/10 p-2 rounded-lg">
                          <Users size={18} className="text-white/70" />
                        </div>
                        <div>
                          <div className="text-lg font-extrabold">{referralStats.totalReferrals}</div>
                          <div className="text-xs text-white/50">Total de indicações</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="bg-white/10 p-2 rounded-lg">
                          <Sparkles size={18} className="text-[#C69214]" />
                        </div>
                        <div>
                          <div className="text-lg font-extrabold text-[#C69214]">+{referralStats.creditsEarned}</div>
                          <div className="text-xs text-white/50">Créditos ganhos</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

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
  const [inepStatus, setInepStatus] = useState<'idle' | 'found' | 'not_found'>('idle');
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

  const handleFetchINEP = async () => {
    const code = (school.inepCode ?? '').replace(/\D/g, '');
    if (!validateINEPCode(code)) {
      alert('Digite um código INEP válido (8 dígitos) antes de buscar.');
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
      alert(e?.message || 'Erro ao buscar dados da escola. Preencha manualmente.');
      setInepStatus('not_found');
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
                  onChange({ ...school, inepCode: e.target.value });
                  setInepStatus('idle');
                }}
                placeholder="Ex: 12345678"
                maxLength={8}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
              />
              <button
                type="button"
                onClick={handleFetchINEP}
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
                Escola não encontrada. Preencha os dados manualmente.
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