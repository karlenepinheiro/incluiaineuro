import React, { useState } from 'react';
import { X, FileText, Printer } from 'lucide-react';

// ── Tipo de configuração da ficha ──────────────────────────────────────────────
export interface FichaConfig {
  // IDENTIFICAÇÃO
  dadosAluno: boolean;
  fotoAluno: boolean;
  logoEscola: boolean;
  enderecoCompleto: boolean;
  codigoUnico: boolean;

  // AVALIAÇÃO E ACOMPANHAMENTO
  ultimaAvaliacao: boolean;
  agendamentos: boolean;
  controleAtendimento: boolean;
  linhaDoTempo: boolean;

  // DOCUMENTOS E RELATÓRIOS
  documentosGerados: boolean;
  relatoriosIA: boolean;
  analiseLaudo: boolean;
  fichasComplementares: boolean;

  // HISTÓRICO
  historicoAtividades: boolean;
}

const DEFAULT_CONFIG: FichaConfig = {
  dadosAluno: true,
  fotoAluno: true,
  logoEscola: true,
  enderecoCompleto: false,
  codigoUnico: true,
  ultimaAvaliacao: true,
  agendamentos: true,
  controleAtendimento: true,
  linhaDoTempo: false,
  documentosGerados: true,
  relatoriosIA: true,
  analiseLaudo: true,
  fichasComplementares: true,
  historicoAtividades: false,
};

const STORAGE_KEY = 'incluiai_ficha_config_v2';

type SectionItem = { key: keyof FichaConfig; label: string; desc: string };
type ConfigSection = { title: string; items: SectionItem[] };

const SECTIONS: ConfigSection[] = [
  {
    title: 'IDENTIFICAÇÃO',
    items: [
      { key: 'dadosAluno',       label: 'Dados do aluno',          desc: 'Nome, nascimento, série, escola e equipe pedagógica' },
      { key: 'fotoAluno',        label: 'Foto do aluno',           desc: 'Avatar ou foto vinculada ao cadastro' },
      { key: 'logoEscola',       label: 'Logo da escola',          desc: 'Logotipo institucional no cabeçalho' },
      { key: 'enderecoCompleto', label: 'Endereço completo',       desc: 'Rua, bairro, cidade e CEP' },
      { key: 'codigoUnico',      label: 'Código único de validação', desc: 'QR code e código auditável no rodapé' },
    ],
  },
  {
    title: 'AVALIAÇÃO E ACOMPANHAMENTO',
    items: [
      { key: 'ultimaAvaliacao',     label: 'Última avaliação gerada',  desc: 'Resumo, radar, barras e parecer descritivo' },
      { key: 'agendamentos',        label: 'Agendamentos',             desc: 'Lista de atendimentos agendados para o aluno' },
      { key: 'controleAtendimento', label: 'Controle de atendimento',  desc: 'Registros de presença e observações de sessão' },
      { key: 'linhaDoTempo',        label: 'Linha do tempo',           desc: 'Histórico cronológico de eventos do aluno' },
    ],
  },
  {
    title: 'DOCUMENTOS E RELATÓRIOS',
    items: [
      { key: 'documentosGerados',    label: 'Documentos gerados',        desc: 'PEI, PAEE, PDI, Estudo de Caso (nome e status)' },
      { key: 'relatoriosIA',         label: 'Relatórios por IA',         desc: 'Relatórios evolutivos gerados automaticamente' },
      { key: 'analiseLaudo',         label: 'Análise de laudo',          desc: 'Síntese e pontos pedagógicos extraídos dos laudos' },
      { key: 'fichasComplementares', label: 'Fichas complementares',     desc: 'Fichas de observação e registros de profissionais' },
    ],
  },
  {
    title: 'HISTÓRICO',
    items: [
      { key: 'historicoAtividades', label: 'Histórico de atividades geradas', desc: 'Data, título, tipo e status — não inclui o conteúdo das atividades' },
    ],
  },
];

// ── Props ─────────────────────────────────────────────────────────────────────
interface FichaConfigModalProps {
  studentName: string;
  onConfirm: (config: FichaConfig) => void;
  onClose: () => void;
}

// ── Checkbox estilizado ───────────────────────────────────────────────────────
const StyledCheckbox: React.FC<{ checked: boolean; onChange: () => void; label: string; desc: string }> = ({ checked, onChange, label, desc }) => (
  <label
    style={{
      display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 12px',
      borderRadius: 10, cursor: 'pointer', transition: 'background 0.15s',
      border: `1.5px solid ${checked ? '#1F4E5F' : '#E5E7EB'}`,
      background: checked ? '#EFF9FF' : '#FFFFFF',
    }}
    onMouseEnter={e => { if (!checked) (e.currentTarget as HTMLElement).style.background = '#F9FAFB'; }}
    onMouseLeave={e => { if (!checked) (e.currentTarget as HTMLElement).style.background = '#FFFFFF'; }}
  >
    {/* Custom checkbox */}
    <div
      style={{
        marginTop: 1, width: 17, height: 17, borderRadius: 4, flexShrink: 0,
        border: `2px solid ${checked ? '#1F4E5F' : '#D1D5DB'}`,
        background: checked ? '#1F4E5F' : 'white',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.15s',
      }}
    >
      {checked && (
        <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
          <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </div>
    <input type="checkbox" checked={checked} onChange={onChange} style={{ display: 'none' }}/>
    <div>
      <p style={{ fontSize: 12, fontWeight: 600, color: '#1A202C', margin: 0 }}>{label}</p>
      <p style={{ fontSize: 10, color: '#6B7280', margin: '2px 0 0 0' }}>{desc}</p>
    </div>
  </label>
);

// ── Modal principal ───────────────────────────────────────────────────────────
export const FichaConfigModal: React.FC<FichaConfigModalProps> = ({ studentName, onConfirm, onClose }) => {
  const [config, setConfig] = useState<FichaConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? { ...DEFAULT_CONFIG, ...JSON.parse(saved) } : DEFAULT_CONFIG;
    } catch {
      return DEFAULT_CONFIG;
    }
  });
  const [generating, setGenerating] = useState(false);

  const toggle   = (key: keyof FichaConfig) => setConfig(prev => ({ ...prev, [key]: !prev[key] }));
  const selectAll = () => setConfig(Object.fromEntries(Object.keys(DEFAULT_CONFIG).map(k => [k, true])) as unknown as FichaConfig);
  const clearAll  = () => setConfig(Object.fromEntries(Object.keys(DEFAULT_CONFIG).map(k => [k, false])) as unknown as FichaConfig);
  const anySelected = Object.values(config).some(Boolean);

  const handleGenerate = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); } catch { /* noop */ }
    setGenerating(true);
    onConfirm(config);
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'white', borderRadius: 20, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', width: '100%', maxWidth: 540, maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ── Cabeçalho ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid #F1F5F9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: '#EFF9FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <FileText size={18} style={{ color: '#1F4E5F' }}/>
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#111827' }}>Personalizar Ficha do Aluno</h2>
              <p style={{ margin: '2px 0 0 0', fontSize: 11, color: '#9CA3AF' }}>Escolha quais informações devem aparecer no PDF final.</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 4, borderRadius: 6 }}>
            <X size={18}/>
          </button>
        </div>

        {/* ── Aluno ── */}
        <div style={{ padding: '10px 20px', background: '#F9FAFB', borderBottom: '1px solid #F1F5F9' }}>
          <p style={{ margin: 0, fontSize: 11, color: '#6B7280' }}>Gerando ficha para: <strong style={{ color: '#111827' }}>{studentName}</strong></p>
        </div>

        {/* ── Ações rápidas ── */}
        <div style={{ padding: '10px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', gap: 8 }}>
          <button
            onClick={selectAll}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#1F4E5F', background: '#EFF9FF', border: '1px solid #BAE6FD', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1" y="1" width="10" height="10" rx="2" stroke="#1F4E5F" strokeWidth="1.5"/><path d="M3 6L5 8L9 4" stroke="#1F4E5F" strokeWidth="1.5" strokeLinecap="round"/></svg>
            Selecionar tudo
          </button>
          <button
            onClick={clearAll}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#6B7280', background: 'white', border: '1px solid #E5E7EB', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1" y="1" width="10" height="10" rx="2" stroke="#9CA3AF" strokeWidth="1.5"/></svg>
            Limpar seleção
          </button>
        </div>

        {/* ── Seções com checkboxes ── */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '16px 20px' }}>
          {SECTIONS.map(section => (
            <div key={section.title} style={{ marginBottom: 20 }}>
              <p style={{ margin: '0 0 8px 0', fontSize: 10, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{section.title}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {section.items.map(item => (
                  <StyledCheckbox
                    key={item.key}
                    checked={config[item.key]}
                    onChange={() => toggle(item.key)}
                    label={item.label}
                    desc={item.desc}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* ── Rodapé ── */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FAFAFA' }}>
          <p style={{ margin: 0, fontSize: 10, color: '#9CA3AF' }}>Sua seleção é salva como padrão automaticamente.</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={onClose}
              style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', background: 'white', border: '1px solid #E5E7EB', borderRadius: 9, padding: '8px 16px', cursor: 'pointer' }}
            >
              Cancelar
            </button>
            <button
              onClick={handleGenerate}
              disabled={!anySelected || generating}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700,
                color: 'white', background: !anySelected || generating ? '#9CA3AF' : '#1F4E5F',
                border: 'none', borderRadius: 9, padding: '8px 18px', cursor: !anySelected || generating ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
              }}
            >
              {generating ? (
                <>
                  <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }}/>
                  Gerando...
                </>
              ) : (
                <><Printer size={14}/> Gerar PDF</>
              )}
            </button>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};
