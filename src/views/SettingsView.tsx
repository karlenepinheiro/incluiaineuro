import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AddOnProduct, TenantSummary, User, SchoolConfig, PlanTier, TeamMember } from '../types';
import { Plus, Trash2, School, User as UserIcon, CreditCard, Star, Mail, Settings, Sparkles, BadgeCheck, AlertTriangle, ShoppingCart, Upload, Building2, MapPin, Phone, AtSign, Hash, FileText, AlertCircle } from 'lucide-react';
import { PaymentService, DEFAULT_ADDONS } from '../services/paymentService';
import { databaseService } from '../services/databaseService';

interface SettingsViewProps {
  user: User;
  onUpdateUser: (updatedUser: User) => void;
  /** usado no onboarding (LGPD -> cadastrar escola/equipe -> dashboard) */
  onFinishSetup?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ user, onUpdateUser, onFinishSetup }) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'team' | 'finance'>('profile');
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [profilePhoto, setProfilePhoto] = useState<string | undefined>(user.profilePhoto);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [schools, setSchools] = useState<SchoolConfig[]>(user.schoolConfigs);
  const [newSchool, setNewSchool] = useState<Partial<SchoolConfig>>({ schoolName: '' });

  const [newMember, setNewMember] = useState<Partial<TeamMember>>({ role: 'Professor Regente' });

  const handleSaveProfile = async () => {
    try {
      await databaseService.updateUserProfile(user.id, { name, email });
      await databaseService.saveSchoolConfigs(user.id, schools);
      onUpdateUser({ ...user, name, email, schoolConfigs: schools, profilePhoto });
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
        team: [] // Initialize empty team
    };
    const updated = [...schools, s];
    setSchools(updated);
    onUpdateUser({ ...user, schoolConfigs: updated });
    setNewSchool({ schoolName: '' });
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

  const handleUpgrade = async (targetPlan: PlanTier) => {
      const url = await PaymentService.getCheckoutUrl(targetPlan, user);
      window.location.href = url;
  };

  const openCustomerPortal = async () => {
    try {
      setFinanceBusy(true);
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
      await databaseService.createPurchaseIntent({
        tenantId: tenantSummary.tenantId,
        userId: user.id,
        kind: product.kind,
        sku: product.sku,
        quantity: product.quantity,
        priceCents: product.priceCents,
      });
      const url = await PaymentService.getAddOnCheckoutUrl(product.sku, user, {
        qty: String(product.quantity),
        kind: product.kind,
      });
      window.open(url, '_blank');
    } catch (e: any) {
      alert(e?.message || 'Não foi possível abrir o checkout do pacote.');
    } finally {
      setFinanceBusy(false);
    }
  };

  const isOverdue = tenantSummary?.subscriptionStatus === 'OVERDUE' || tenantSummary?.subscriptionStatus === 'PENDING';

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
                  {schools.map((s, idx) => (
                    <div key={s.id} className="rounded-xl border border-gray-200 overflow-hidden">
                      <div className="bg-gray-50 p-4 border-b border-gray-200 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-9 h-9 rounded-lg bg-brand-100 text-brand-700 flex items-center justify-center font-bold">
                            {idx + 1}
                          </div>
                          <div>
                            <div className="font-bold text-gray-900">{s.schoolName?.trim() ? s.schoolName : 'Escola (preencha abaixo)'}</div>
                            {idx === 0 && <div className="text-[11px] text-gray-500">Escola principal</div>}
                          </div>
                        </div>
                        {idx > 0 && (
                          <button
                            onClick={() => {
                              const updated = schools.filter(x => x.id !== s.id);
                              setSchools(updated);
                              onUpdateUser({ ...user, schoolConfigs: updated });
                            }}
                            className="text-red-500 hover:bg-red-50 p-2 rounded"
                            title="Remover escola"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>

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
                    </div>
                  ))}
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
                      onClick={() => handleUpgrade(PlanTier.PRO)}
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
                <div className="p-4 rounded-2xl bg-white border border-gray-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase font-extrabold text-gray-500">Status</span>
                    {isOverdue ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full bg-yellow-100 text-yellow-800">
                        <AlertTriangle size={14} /> Pendente
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full bg-green-100 text-green-700">
                        <BadgeCheck size={14} /> Ativo
                      </span>
                    )}
                  </div>
                  <div className="mt-3 text-2xl font-extrabold text-gray-900">
                    {tenantSummary?.planTier ? tenantSummary.planTier : user.plan}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Renovação do plano: {tenantSummary?.renewalDatePlan ? new Date(tenantSummary.renewalDatePlan).toLocaleDateString() : '—'}</p>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-gray-200">
                  <span className="text-xs uppercase font-extrabold text-gray-500">Créditos IA</span>
                  <div className="mt-2 text-3xl font-extrabold text-gray-900">
                    {tenantSummary ? tenantSummary.aiCreditsRemaining : '—'}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Renovação de créditos: {tenantSummary?.renewalDateCredits ? new Date(tenantSummary.renewalDateCredits).toLocaleDateString() : '—'}</p>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-gray-200">
                  <span className="text-xs uppercase font-extrabold text-gray-500">Alunos ativos</span>
                  <div className="mt-2 text-3xl font-extrabold text-gray-900">
                    {tenantSummary ? `${tenantSummary.studentsActive}/${totalStudentLimit ?? '—'}` : '—'}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Base: {tenantSummary?.studentLimitBase ?? '—'} • Extras: {tenantSummary?.studentLimitExtra ?? '—'}</p>
                </div>
              </div>

              {isOverdue && (
                <div className="mt-4 p-4 rounded-2xl bg-yellow-50 border border-yellow-100 flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <p className="font-extrabold text-yellow-900">Pagamento pendente</p>
                    <p className="text-sm text-yellow-800">Para manter acesso completo, regularize sua assinatura.</p>
                  </div>
                  <button
                    disabled={financeBusy}
                    onClick={openCustomerPortal}
                    className="bg-yellow-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-yellow-700 flex items-center gap-2 disabled:opacity-60"
                  >
                    <CreditCard size={16} /> Pagar agora
                  </button>
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
                <div className="text-xs text-gray-500">* Checkout abre em nova aba (Kiwify)</div>
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

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return alert('Selecione uma imagem (PNG, JPG, SVG).');
    if (file.size > 1024 * 1024 * 2) return alert('Imagem muito grande. Use até 2 MB.');
    const reader = new FileReader();
    reader.onloadend = () => onChange({ ...school, logoUrl: reader.result as string });
    reader.readAsDataURL(file);
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
          <SchoolField school={school} onChange={onChange}label="Código INEP" field="inepCode" placeholder="Ex: 12345678" />
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
          <SchoolField school={school} onChange={onChange}label="CEP" field="zipcode" placeholder="00000-000" />
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