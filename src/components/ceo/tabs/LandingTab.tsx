import React, { useState, useEffect } from 'react';
import {
  Layers, Package, CreditCard, Zap, AlertCircle, FileText,
  PlusCircle, Trash2, RefreshCw, Globe, AlertTriangle,
} from 'lucide-react';
import { LandingService } from '../../../services/landingService';
import type { AdminUser } from '../../../types';

// ── Local types ──────────────────────────────────────────────────────────────

type LDSectionDraft = {
  title: string;
  subtitle: string;
  content_json: Record<string, any>;
  updated_at?: string;
};
type LDDrafts = Record<string, LDSectionDraft>;
type LDEditorProps = { sectionKey: string; draft: LDSectionDraft; setJson: (patch: Record<string, any>) => void };

// ── Styles ───────────────────────────────────────────────────────────────────

const LD_FIELD: React.CSSProperties = {
  width: '100%', border: '1.5px solid #E2E8F0', borderRadius: 10,
  padding: '10px 14px', fontSize: 14, color: '#0F172A', outline: 'none',
  boxSizing: 'border-box', fontFamily: 'inherit', background: '#FFFFFF',
  transition: 'border-color 0.15s',
};
const LD_LABEL: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 };
const LD_SECTION_TAG: React.CSSProperties = { fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#94A3B8', marginBottom: 14, display: 'block' };
const LD_CARD: React.CSSProperties = { background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 18, padding: '24px 28px', marginBottom: 16 };
const LD_GRID2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 };
const LD_ADDBUTTON = (color: string): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 5, padding: '5px 14px',
  borderRadius: 8, border: `1px solid ${color}40`, background: `${color}10`,
  color, fontSize: 12, fontWeight: 700, cursor: 'pointer',
});
const LD_DELBTN: React.CSSProperties = {
  padding: '9px 12px', background: '#FEF2F2', border: '1px solid #FECACA',
  color: '#DC2626', borderRadius: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0,
};

// ── Section definitions ──────────────────────────────────────────────────────

const LD_SECTIONS = [
  { key: 'hero',      label: 'Hero',           icon: Layers,       color: '#6366F1', desc: 'Título, subtítulo e botões da página inicial' },
  { key: 'planos',    label: 'Planos',         icon: Package,      color: '#0EA5E9', desc: 'Preços, taglines e features dos planos PRO e PREMIUM' },
  { key: 'descontos', label: 'Descontos',      icon: CreditCard,   color: '#16A34A', desc: 'Cupons promocionais e textos de urgência' },
  { key: 'kiwify',    label: 'Links Kiwify',   icon: CreditCard,   color: '#16A34A', desc: 'URLs de checkout dos produtos na Kiwify' },
  { key: 'creditos',  label: 'Créditos',       icon: Zap,          color: '#D97706', desc: 'Pacotes de créditos avulsos (adicionar / editar / remover)' },
  { key: 'avisos',    label: 'Avisos',         icon: AlertCircle,  color: '#DC2626', desc: '48h, vitalício, parcelamento e selos de confiança' },
  { key: 'faq',       label: 'FAQ',            icon: FileText,     color: '#7C3AED', desc: 'Perguntas e respostas (adicionar / editar / remover)' },
];

const LD_DEFAULTS: LDDrafts = {
  hero: {
    title: 'A IA que entende a educação inclusiva',
    subtitle: 'Gere documentos, PEI, PAEE e relatórios em segundos. Devolvendo seu tempo e sua energia.',
    content_json: { cta_primary: 'Começar grátis', cta_secondary: 'Entrar' },
  },
  planos: {
    title: 'Invista onde o impacto é real.',
    subtitle: 'Chega de levar o planejamento para o domingo.',
    content_json: {
      pro_full_price: 79, pro_discount_price: 59,
      pro_tagline: 'Para professores e especialistas',
      pro_features: ['Até 30 alunos', 'PEI, PAEE, PDI e relatórios', 'Atividades com BNCC', 'Histórico do aluno', 'Suporte padrão'],
      premium_full_price: 122, premium_discount_price: 99,
      premium_tagline: 'Para escolas e clínicas',
      premium_features: ['Alunos ilimitados', 'Tudo do plano Pro', 'Análise de laudos com IA', 'Geração avançada de atividades', 'Relatórios evolutivos completos', 'Prioridade em novos recursos'],
    },
  },
  descontos: {
    title: 'Cupons e descontos ativos',
    subtitle: 'Configure os cupons exibidos na landing page.',
    content_json: {
      pro_coupon: 'INCLUIAI59', pro_coupon_active: true,
      premium_coupon: 'INCLUIAI99', premium_coupon_active: true,
      badge_label: 'Valores promocionais por tempo limitado',
      urgency_label: 'Oferta válida por 48 horas',
    },
  },
  kiwify: {
    title: 'Links de Checkout Kiwify',
    subtitle: 'Cole aqui as URLs completas dos produtos criados na Kiwify.',
    content_json: {
      pro_monthly_url: '',
      pro_annual_url: '',
      premium_monthly_url: '',
      premium_annual_url: '',
      credits_100_url: '',
      credits_300_url: '',
      credits_900_url: '',
    },
  },
  creditos: {
    title: 'Pacotes de créditos avulsos',
    subtitle: 'Configure os pacotes exibidos na landing e no app.',
    content_json: {
      packages: [
        { id: 'pkg_100', credits: 100, price: 29.90, label: 'Pacote Básico' },
        { id: 'pkg_300', credits: 300, price: 79.90, label: 'Pacote Intermediário' },
        { id: 'pkg_900', credits: 900, price: 149.90, label: 'Pacote Avançado' },
      ],
    },
  },
  avisos: {
    title: 'Avisos comerciais',
    subtitle: 'Mensagens e selos exibidos na landing page.',
    content_json: {
      urgency_badge: 'Valores promocionais por tempo limitado',
      urgency_clock: 'Oferta válida por 48 horas',
      installment_title: 'Parcelamento inteligente que facilita a aprovação',
      installment_items: ['Mais leve no limite do cartão', 'Sem necessidade de limite alto disponível', 'Parcele em até 12x'],
      lifetime_active: false,
      lifetime_text: 'Acesso vitalício disponível para fundadores',
      trust_items: ['Cancele quando quiser', 'Sem taxa de instalação', 'LGPD conforme', 'Suporte incluído'],
    },
  },
  faq: {
    title: 'Perguntas frequentes',
    subtitle: 'Tire suas dúvidas sobre o IncluiAI.',
    content_json: {
      items: [
        { q: 'Para quem é o IncluiAI?', a: 'Para professores de AEE, psicopedagogos, fonoaudiólogos e demais profissionais de educação inclusiva.' },
        { q: 'Os dados dos alunos são seguros?', a: 'Sim. Armazenamos em conformidade com a LGPD, com criptografia e auditoria SHA-256.' },
        { q: 'Posso cancelar a qualquer momento?', a: 'Sim, sem multas ou taxas de cancelamento.' },
      ],
    },
  },
};

// ── Sub-editors ──────────────────────────────────────────────────────────────

const LDHeroEditor: React.FC<LDEditorProps> = ({ sectionKey: _, draft, setJson }) => {
  const cj = draft.content_json;
  return (
    <div style={LD_CARD}>
      <span style={LD_SECTION_TAG}>Botões e CTAs</span>
      <div style={LD_GRID2}>
        {([
          { k: 'cta_primary',   label: 'Botão principal (CTA primário)' },
          { k: 'cta_secondary', label: 'Botão secundário (login / entrar)' },
        ] as const).map(({ k, label }) => (
          <div key={k}>
            <label style={LD_LABEL}>{label}</label>
            <input style={LD_FIELD} value={String(cj[k] ?? '')} onChange={e => setJson({ [k]: e.target.value })} />
          </div>
        ))}
      </div>
    </div>
  );
};

const LDPlanosEditor: React.FC<LDEditorProps> = ({ sectionKey: _, draft, setJson }) => {
  const cj = draft.content_json;
  const updateFeature = (plan: string, i: number, val: string) => {
    const arr = [...(cj[`${plan}_features`] ?? [])]; arr[i] = val;
    setJson({ [`${plan}_features`]: arr });
  };
  const addFeature = (plan: string) => setJson({ [`${plan}_features`]: [...(cj[`${plan}_features`] ?? []), 'Nova feature'] });
  const removeFeature = (plan: string, i: number) => setJson({ [`${plan}_features`]: (cj[`${plan}_features`] ?? []).filter((_: any, idx: number) => idx !== i) });

  const PlanCard = ({ plan, label, color }: { plan: string; label: string; color: string }) => (
    <div style={{ border: `1.5px solid ${color}25`, borderRadius: 16, padding: 20, background: `${color}05` }}>
      <div style={{ fontSize: 13, fontWeight: 800, color, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 7 }}>
        <Package size={14} color={color} /> Plano {label}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div>
          <label style={LD_LABEL}>Preço De (riscado) R$</label>
          <input type="number" style={LD_FIELD} value={Number(cj[`${plan}_full_price`] ?? 0)} onChange={e => setJson({ [`${plan}_full_price`]: Number(e.target.value) })} />
        </div>
        <div>
          <label style={LD_LABEL}>Preço por (desconto) R$</label>
          <input type="number" style={LD_FIELD} value={Number(cj[`${plan}_discount_price`] ?? 0)} onChange={e => setJson({ [`${plan}_discount_price`]: Number(e.target.value) })} />
        </div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={LD_LABEL}>Tagline do plano</label>
        <input style={LD_FIELD} value={String(cj[`${plan}_tagline`] ?? '')} onChange={e => setJson({ [`${plan}_tagline`]: e.target.value })} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <label style={{ ...LD_LABEL, marginBottom: 0 }}>Features</label>
        <button onClick={() => addFeature(plan)} style={LD_ADDBUTTON(color)}>
          <PlusCircle size={12} /> Adicionar
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {(cj[`${plan}_features`] ?? []).map((f: string, i: number) => (
          <div key={i} style={{ display: 'flex', gap: 8 }}>
            <input style={{ ...LD_FIELD, flex: 1 }} value={f} onChange={e => updateFeature(plan, i, e.target.value)} />
            <button onClick={() => removeFeature(plan, i)} style={LD_DELBTN}><Trash2 size={13} /></button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div style={LD_CARD}>
      <span style={LD_SECTION_TAG}>Planos PRO e PREMIUM — preços, taglines e features</span>
      <div style={LD_GRID2}>
        <PlanCard plan="pro" label="PRO" color="#1E3A5F" />
        <PlanCard plan="premium" label="PREMIUM" color="#7C3AED" />
      </div>
    </div>
  );
};

const LDDescontosEditor: React.FC<LDEditorProps> = ({ sectionKey: _, draft, setJson }) => {
  const cj = draft.content_json;
  return (
    <>
      <div style={LD_CARD}>
        <span style={LD_SECTION_TAG}>Cupons de desconto</span>
        <div style={LD_GRID2}>
          {/* PRO */}
          <div style={{ border: '1.5px solid #BBF7D0', borderRadius: 14, padding: 18, background: '#F0FDF4' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#16A34A', marginBottom: 14 }}>Cupom PRO</div>
            <label style={LD_LABEL}>Código</label>
            <input style={{ ...LD_FIELD, fontFamily: 'monospace', fontWeight: 800, fontSize: 17, letterSpacing: '0.06em', marginBottom: 12 }}
              value={String(cj.pro_coupon ?? '')}
              onChange={e => setJson({ pro_coupon: e.target.value.toUpperCase() })} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#374151', fontWeight: 600 }}>
              <input type="checkbox" checked={Boolean(cj.pro_coupon_active ?? true)} onChange={e => setJson({ pro_coupon_active: e.target.checked })} />
              Ativo — exibir na landing
            </label>
          </div>
          {/* MASTER */}
          <div style={{ border: '1.5px solid #DDD6FE', borderRadius: 14, padding: 18, background: '#FAF5FF' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#7C3AED', marginBottom: 14 }}>Cupom PREMIUM</div>
            <label style={LD_LABEL}>Código</label>
            <input style={{ ...LD_FIELD, fontFamily: 'monospace', fontWeight: 800, fontSize: 17, letterSpacing: '0.06em', marginBottom: 12 }}
              value={String(cj.premium_coupon ?? '')}
              onChange={e => setJson({ premium_coupon: e.target.value.toUpperCase() })} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#374151', fontWeight: 600 }}>
              <input type="checkbox" checked={Boolean(cj.master_coupon_active ?? true)} onChange={e => setJson({ master_coupon_active: e.target.checked })} />
              Ativo — exibir na landing
            </label>
          </div>
        </div>
      </div>
      <div style={LD_CARD}>
        <span style={LD_SECTION_TAG}>Textos de urgência</span>
        <div style={LD_GRID2}>
          <div>
            <label style={LD_LABEL}>Badge superior (barra chama)</label>
            <input style={LD_FIELD} value={String(cj.badge_label ?? '')} onChange={e => setJson({ badge_label: e.target.value })} />
          </div>
          <div>
            <label style={LD_LABEL}>Badge do relógio (48h etc)</label>
            <input style={LD_FIELD} value={String(cj.urgency_label ?? '')} onChange={e => setJson({ urgency_label: e.target.value })} />
          </div>
        </div>
      </div>
    </>
  );
};

const LDKiwifyEditor: React.FC<LDEditorProps> = ({ draft, setJson }) => {
  const cj = draft.content_json;
  const fields = [
      { key: 'pro_monthly_url', label: 'PRO Mensal' },
      { key: 'pro_annual_url', label: 'PRO Anual' },
      { key: 'premium_monthly_url', label: 'PREMIUM Mensal' },
      { key: 'premium_annual_url', label: 'PREMIUM Anual' },
      { key: 'credits_100_url', label: 'Créditos 100 (AI100)' },
      { key: 'credits_300_url', label: 'Créditos 300 (AI300)' },
      { key: 'credits_900_url', label: 'Créditos 900 (AI900)' },
  ] as const;

  return (
      <div style={LD_CARD}>
          <span style={LD_SECTION_TAG}>URLs de Checkout</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {fields.map(({ key, label }) => (
                  <div key={key}>
                      <label style={LD_LABEL}>{label}</label>
                      <input
                          style={LD_FIELD}
                          value={String(cj[key] ?? '')}
                          onChange={e => setJson({ [key]: e.target.value })}
                          placeholder="https://kiwify.app/..."
                      />
                  </div>
              ))}
          </div>
      </div>
  );
};

const LDCreditosEditor: React.FC<LDEditorProps> = ({ sectionKey: _, draft, setJson }) => {
  const packages: any[] = draft.content_json.packages ?? [];
  const updatePkg = (i: number, field: string, val: any) => setJson({ packages: packages.map((p, idx) => idx === i ? { ...p, [field]: val } : p) });
  const addPkg = () => setJson({ packages: [...packages, { id: `pkg_${Date.now()}`, credits: 100, price: 29.90, label: 'Novo pacote' }] });
  const removePkg = (i: number) => setJson({ packages: packages.filter((_, idx) => idx !== i) });

  return (
    <div style={LD_CARD}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <span style={{ ...LD_SECTION_TAG, marginBottom: 0 }}>Pacotes de créditos ({packages.length})</span>
        <button onClick={addPkg} style={LD_ADDBUTTON('#D97706')}>
          <PlusCircle size={13} /> Novo pacote
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {packages.map((pkg, i) => (
          <div key={i} style={{ border: '1.5px solid #FDE68A', borderRadius: 14, padding: '18px 20px', background: '#FFFBEB', display: 'grid', gridTemplateColumns: '130px 140px 1fr auto', gap: 14, alignItems: 'flex-end' }}>
            <div>
              <label style={LD_LABEL}>Créditos</label>
              <input type="number" style={LD_FIELD} value={pkg.credits} onChange={e => updatePkg(i, 'credits', Number(e.target.value))} />
            </div>
            <div>
              <label style={LD_LABEL}>Preço (R$)</label>
              <input type="number" step="0.01" style={LD_FIELD} value={pkg.price} onChange={e => updatePkg(i, 'price', Number(e.target.value))} />
            </div>
            <div>
              <label style={LD_LABEL}>Descrição do pacote</label>
              <input style={LD_FIELD} value={pkg.label ?? ''} onChange={e => updatePkg(i, 'label', e.target.value)} />
            </div>
            <button onClick={() => removePkg(i)} style={LD_DELBTN}><Trash2 size={14} /></button>
          </div>
        ))}
        {packages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '28px 0', color: '#94A3B8', fontSize: 14 }}>Nenhum pacote cadastrado.</div>
        )}
      </div>
    </div>
  );
};

const LDAvisosEditor: React.FC<LDEditorProps> = ({ sectionKey: _, draft, setJson }) => {
  const cj = draft.content_json;
  const updList = (field: string, i: number, val: string) => { const a = [...(cj[field] ?? [])]; a[i] = val; setJson({ [field]: a }); };
  const addList = (field: string) => setJson({ [field]: [...(cj[field] ?? []), 'Novo item'] });
  const rmList  = (field: string, i: number) => setJson({ [field]: (cj[field] ?? []).filter((_: any, idx: number) => idx !== i) });

  const ListEditor = ({ field, label, color }: { field: string; label: string; color: string }) => (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <label style={{ ...LD_LABEL, marginBottom: 0 }}>{label}</label>
        <button onClick={() => addList(field)} style={LD_ADDBUTTON(color)}><PlusCircle size={12} /> Adicionar</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {(cj[field] ?? []).map((item: string, i: number) => (
          <div key={i} style={{ display: 'flex', gap: 8 }}>
            <input style={{ ...LD_FIELD, flex: 1 }} value={item} onChange={e => updList(field, i, e.target.value)} />
            <button onClick={() => rmList(field, i)} style={LD_DELBTN}><Trash2 size={13} /></button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <div style={LD_CARD}>
        <span style={LD_SECTION_TAG}>Badges de urgência</span>
        <div style={LD_GRID2}>
          <div>
            <label style={LD_LABEL}>Badge superior (chama / Flame)</label>
            <input style={LD_FIELD} value={String(cj.urgency_badge ?? '')} onChange={e => setJson({ urgency_badge: e.target.value })} />
          </div>
          <div>
            <label style={LD_LABEL}>Badge do relógio (ex: 48 horas)</label>
            <input style={LD_FIELD} value={String(cj.urgency_clock ?? '')} onChange={e => setJson({ urgency_clock: e.target.value })} />
          </div>
        </div>
      </div>
      <div style={LD_CARD}>
        <span style={LD_SECTION_TAG}>Bloco de parcelamento inteligente</span>
        <div style={{ marginBottom: 14 }}>
          <label style={LD_LABEL}>Título do bloco</label>
          <input style={LD_FIELD} value={String(cj.installment_title ?? '')} onChange={e => setJson({ installment_title: e.target.value })} />
        </div>
        <ListEditor field="installment_items" label="Itens do parcelamento" color="#1D4ED8" />
      </div>
      <div style={LD_CARD}>
        <span style={LD_SECTION_TAG}>Aviso vitalício (opcional)</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#374151', fontWeight: 600, marginBottom: 12 }}>
          <input type="checkbox" checked={Boolean(cj.lifetime_active ?? false)} onChange={e => setJson({ lifetime_active: e.target.checked })} />
          Exibir aviso de acesso vitalício na landing
        </label>
        <label style={LD_LABEL}>Texto do aviso</label>
        <input style={{ ...LD_FIELD, opacity: cj.lifetime_active ? 1 : 0.45 }} value={String(cj.lifetime_text ?? '')} disabled={!cj.lifetime_active} onChange={e => setJson({ lifetime_text: e.target.value })} />
      </div>
      <div style={LD_CARD}>
        <span style={LD_SECTION_TAG}>Selos de confiança (rodapé da seção de preços)</span>
        <ListEditor field="trust_items" label="Selos" color="#16A34A" />
      </div>
    </>
  );
};

const LDFaqEditor: React.FC<LDEditorProps> = ({ sectionKey: _, draft, setJson }) => {
  const items: { q: string; a: string }[] = draft.content_json.items ?? [];
  const upd = (i: number, field: 'q' | 'a', val: string) => setJson({ items: items.map((it, idx) => idx === i ? { ...it, [field]: val } : it) });
  const add = () => setJson({ items: [...items, { q: 'Nova pergunta?', a: 'Resposta aqui...' }] });
  const remove = (i: number) => setJson({ items: items.filter((_, idx) => idx !== i) });

  return (
    <div style={LD_CARD}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <span style={{ ...LD_SECTION_TAG, marginBottom: 0 }}>Perguntas e respostas ({items.length})</span>
        <button onClick={add} style={LD_ADDBUTTON('#7C3AED')}><PlusCircle size={13} /> Adicionar pergunta</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {items.map((item, i) => (
          <div key={i} style={{ border: '1.5px solid #E2E8F0', borderRadius: 14, padding: '18px 20px', background: '#FAFAFA' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: '#7C3AED', background: '#F5F3FF', padding: '3px 12px', borderRadius: 20 }}>#{i + 1}</span>
              <button onClick={() => remove(i)} style={{ display: 'flex', alignItems: 'center', gap: 5, ...LD_DELBTN, padding: '5px 12px', fontSize: 12, fontWeight: 600 }}>
                <Trash2 size={12} /> Remover
              </button>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={LD_LABEL}>Pergunta</label>
              <input style={LD_FIELD} value={item.q} onChange={e => upd(i, 'q', e.target.value)} />
            </div>
            <div>
              <label style={LD_LABEL}>Resposta</label>
              <textarea rows={3} style={{ ...LD_FIELD, resize: 'vertical' } as React.CSSProperties} value={item.a} onChange={e => upd(i, 'a', e.target.value)} />
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 0', color: '#94A3B8', fontSize: 14 }}>
            Sem perguntas cadastradas. Clique em "Adicionar pergunta" para começar.
          </div>
        )}
      </div>
    </div>
  );
};

// ── Publish confirmation modal ────────────────────────────────────────────────

interface PublishLandingModalProps {
  reason: string;
  onReasonChange: (v: string) => void;
  error: string;
  onConfirm: () => void;
  onClose: () => void;
  loading: boolean;
}
const PublishLandingModal: React.FC<PublishLandingModalProps> = ({
  reason, onReasonChange, error, onConfirm, onClose, loading,
}) => (
  <div style={{
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 9999, padding: 16,
  }}>
    <div style={{
      background: 'white', borderRadius: 16, padding: 28,
      width: '100%', maxWidth: 460, boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Globe size={20} style={{ color: '#1D4ED8' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontWeight: 800, fontSize: 15, color: '#111827', margin: 0 }}>Publicar alterações da landing?</h3>
          <p style={{ fontSize: 12, color: '#6B7280', margin: '2px 0 0' }}>Esta ação afeta o conteúdo em produção imediatamente.</p>
        </div>
        <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: '#DBEAFE', color: '#1D4ED8', border: '1px solid #BFDBFE', letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0 }}>
          PRODUÇÃO
        </span>
      </div>
      <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, marginBottom: 10 }}>
        Esta ação pode alterar o conteúdo comercial exibido publicamente, incluindo textos, ofertas, chamadas, seções e elementos usados em campanhas.
      </p>
      <p style={{ fontSize: 12, color: '#1E40AF', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '8px 12px', marginBottom: 18, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
        Confirme apenas se você revisou as alterações e deseja publicá-las no ambiente atual.
      </p>
      <div style={{ marginBottom: 18 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>
          Motivo administrativo <span style={{ color: '#EF4444' }}>*</span>
        </label>
        <textarea
          value={reason}
          onChange={e => onReasonChange(e.target.value)}
          disabled={loading}
          placeholder="Descreva o motivo para publicar estas alterações…"
          rows={3}
          style={{
            width: '100%', boxSizing: 'border-box', borderRadius: 8,
            border: error ? '1.5px solid #EF4444' : '1.5px solid #E5E7EB',
            padding: '8px 10px', fontSize: 13, color: '#111827', resize: 'vertical',
            outline: 'none', fontFamily: 'inherit',
          }}
        />
        {error && <p style={{ fontSize: 12, color: '#EF4444', marginTop: 4 }}>{error}</p>}
      </div>
      {/* TODO: futura sprint — enviar publishReason para tabela de auditoria administrativa */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={onConfirm}
          disabled={loading || !reason.trim()}
          style={{
            flex: 1, padding: '10px', borderRadius: 8, border: 'none',
            background: loading || !reason.trim() ? '#9CA3AF' : '#0F172A',
            color: 'white', fontWeight: 700, fontSize: 13,
            cursor: loading || !reason.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Publicando…' : 'Sim, publicar alterações'}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          style={{ padding: '10px 18px', borderRadius: 8, border: '1.5px solid #E5E7EB', background: 'white', color: '#374151', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
        >
          Cancelar
        </button>
      </div>
    </div>
  </div>
);

// ── Main LandingTab ──────────────────────────────────────────────────────────

export const LandingTab = ({ adminUser }: { adminUser: AdminUser }) => {
  const [drafts, setDrafts]   = useState<LDDrafts>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [activeSection, setActiveSection] = useState<string>('hero');
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [publishReason, setPublishReason] = useState('');
  const [publishError, setPublishError] = useState('');

  useEffect(() => {
    LandingService.getAll().then(sections => {
      const merged: LDDrafts = {};
      // seed with defaults
      Object.keys(LD_DEFAULTS).forEach(k => {
        merged[k] = { ...LD_DEFAULTS[k], content_json: { ...LD_DEFAULTS[k].content_json } };
      });
      // overlay DB data
      sections.forEach(s => {
        const k = s.section_key;
        merged[k] = {
          title:        s.title    ?? merged[k]?.title    ?? '',
          subtitle:     s.subtitle ?? merged[k]?.subtitle ?? '',
          content_json: { ...(merged[k]?.content_json ?? {}), ...(s.content_json ?? {}) },
          updated_at:   s.updated_at,
        };
      });
      setDrafts(merged);
      setLoading(false);
    });
  }, []);

  const setDraftField = (key: string, patch: Partial<LDSectionDraft>) =>
    setDrafts(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const setJson = (key: string, patch: Record<string, any>) =>
    setDrafts(prev => ({
      ...prev,
      [key]: { ...prev[key], content_json: { ...prev[key].content_json, ...patch } },
    }));

  const handleSaveAll = () => {
    if (!['super_admin', 'operacional'].includes(adminUser.role)) { alert('Permissão negada'); return; }
    setPublishConfirmOpen(true);
    setPublishReason('');
    setPublishError('');
  };

  const confirmPublish = async () => {
    if (!publishReason.trim()) {
      setPublishError('Motivo administrativo é obrigatório.');
      return;
    }
    setSaving(true);
    try {
      // TODO: futura sprint — enviar publishReason para tabela de auditoria administrativa
      await LandingService.saveAll(
        (Object.entries(drafts) as [string, LDSectionDraft][]).map(([key, d]) => ({
          sectionKey: key, title: d.title, subtitle: d.subtitle, contentJson: d.content_json,
        })),
        undefined,
        adminUser.name,
      );
      setSaveMsg('Publicado com sucesso!');
      setTimeout(() => setSaveMsg(null), 3500);
      setPublishConfirmOpen(false);
      setPublishReason('');
      setPublishError('');
    } catch (e: any) {
      setPublishError(e?.message ?? 'Erro ao publicar alterações.');
    } finally {
      setSaving(false);
    }
  };

  const activeMeta = LD_SECTIONS.find(s => s.key === activeSection)!;
  const draft      = drafts[activeSection] ?? { title: '', subtitle: '', content_json: {} };
  const makeSetJson = (k: string) => (patch: Record<string, any>) => setJson(k, patch);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: 10, color: '#94A3B8' }}>
      <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} /> Carregando conteúdo...
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.03em', marginBottom: 4 }}>Landing / Comercial</h2>
          <p style={{ fontSize: 14, color: '#64748B' }}>Edite títulos, preços, cupons e conteúdo sem precisar de deploy.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {saveMsg && (
            <span style={{ fontSize: 13, color: '#16A34A', fontWeight: 600, background: '#F0FDF4', padding: '8px 16px', borderRadius: 10, border: '1px solid #BBF7D0' }}>
              ✓ {saveMsg}
            </span>
          )}
          <button
            onClick={handleSaveAll} disabled={saving}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, background: '#0F172A', color: 'white',
              padding: '11px 24px', borderRadius: 12, fontSize: 14, fontWeight: 700,
              border: 'none', cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1,
              boxShadow: '0 4px 16px rgba(15,23,42,0.18)', transition: 'opacity 0.2s',
            }}
          >
            {saving ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Globe size={14} />}
            Salvar e Publicar
          </button>
        </div>
      </div>

      {/* ── Layout: sidebar + editor ────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 22, alignItems: 'flex-start' }}>

        {/* Sidebar */}
        <nav style={{ width: 210, flexShrink: 0, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 18, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {LD_SECTIONS.map(s => {
            const isActive = activeSection === s.key;
            const Icon = s.icon;
            return (
              <button key={s.key} onClick={() => setActiveSection(s.key)} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px',
                borderRadius: 12, border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer',
                background: isActive ? s.color : 'transparent',
                color: isActive ? 'white' : '#64748B',
                fontSize: 14, fontWeight: isActive ? 700 : 500,
                transition: 'all 0.15s',
                boxShadow: isActive ? `0 4px 14px ${s.color}35` : 'none',
              }}>
                <Icon size={15} />
                {s.label}
              </button>
            );
          })}
        </nav>

        {/* Editor panel */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Section header card */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 18, padding: '18px 24px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 42, height: 42, background: `${activeMeta.color}15`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <activeMeta.icon size={19} color={activeMeta.color} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>{activeMeta.label}</div>
              <div style={{ fontSize: 12, color: '#94A3B8' }}>{activeMeta.desc}</div>
            </div>
            {draft.updated_at && (
              <div style={{ fontSize: 11, color: '#94A3B8', textAlign: 'right', flexShrink: 0 }}>
                Atualizado em<br />
                <strong style={{ color: '#64748B' }}>{new Date(draft.updated_at).toLocaleString('pt-BR')}</strong>
              </div>
            )}
          </div>

          {/* Title + Subtitle */}
          <div style={{ ...LD_CARD, marginBottom: 16 }}>
            <span style={LD_SECTION_TAG}>Textos principais da seção</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={LD_LABEL}>Título</label>
                <input style={LD_FIELD} value={draft.title} onChange={e => setDraftField(activeSection, { title: e.target.value })} />
              </div>
              <div>
                <label style={LD_LABEL}>Subtítulo / descrição</label>
                <textarea rows={2} style={{ ...LD_FIELD, resize: 'vertical' } as React.CSSProperties}
                  value={draft.subtitle}
                  onChange={e => setDraftField(activeSection, { subtitle: e.target.value })} />
              </div>
            </div>
          </div>

          {/* Section-specific editor */}
          {activeSection === 'hero'      && <LDHeroEditor      sectionKey={activeSection} draft={draft} setJson={makeSetJson(activeSection)} />}
          {activeSection === 'planos'    && <LDPlanosEditor    sectionKey={activeSection} draft={draft} setJson={makeSetJson(activeSection)} />}
          {activeSection === 'descontos' && <LDDescontosEditor sectionKey={activeSection} draft={draft} setJson={makeSetJson(activeSection)} />}
          {activeSection === 'kiwify'    && <LDKiwifyEditor    sectionKey={activeSection} draft={draft} setJson={makeSetJson(activeSection)} />}
          {activeSection === 'creditos'  && <LDCreditosEditor  sectionKey={activeSection} draft={draft} setJson={makeSetJson(activeSection)} />}
          {activeSection === 'avisos'    && <LDAvisosEditor    sectionKey={activeSection} draft={draft} setJson={makeSetJson(activeSection)} />}
          {activeSection === 'faq'       && <LDFaqEditor       sectionKey={activeSection} draft={draft} setJson={makeSetJson(activeSection)} />}
        </div>
      </div>

      {publishConfirmOpen && (
        <PublishLandingModal
          reason={publishReason}
          onReasonChange={v => { setPublishReason(v); if (publishError) setPublishError(''); }}
          error={publishError}
          onConfirm={confirmPublish}
          onClose={() => { setPublishConfirmOpen(false); setPublishReason(''); setPublishError(''); }}
          loading={saving}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};
