// Sprint 5B — QuickDocModal
// Geração rápida de documentos complementares a partir da ficha do aluno.
// Tipos suportados: encaminhamento_redes | convite_reuniao | termo_desligamento
import React, { useState } from 'react';
import { X, Download, Loader2, CheckCircle2, AlertCircle, FileText, Send, LogOut } from 'lucide-react';
import { Student, User, SchoolConfig } from '../types';
import { PDFGenerator } from '../services/PDFGenerator';

const C = {
  petrol:  '#1F4E5F',
  dark:    '#2E3A59',
  gold:    '#C69214',
  border:  '#E7E2D8',
  muted:   '#667085',
  surface: '#FFFFFF',
  bg:      '#F6F4EF',
  red:     '#EF4444',
  green:   '#10B981',
};

export type QuickDocType = 'encaminhamento_redes' | 'convite_reuniao' | 'termo_desligamento';

const DOC_META: Record<QuickDocType, { title: string; icon: React.ReactNode; color: string; bg: string }> = {
  encaminhamento_redes: {
    title: 'Encaminhamento',
    icon: <Send size={18} />,
    color: C.petrol,
    bg: '#EFF9FF',
  },
  convite_reuniao: {
    title: 'Convite para Reunião',
    icon: <FileText size={18} />,
    color: C.dark,
    bg: '#F3F4F6',
  },
  termo_desligamento: {
    title: 'Termo de Desligamento',
    icon: <LogOut size={18} />,
    color: '#9A3412',
    bg: '#FFF7ED',
  },
};

interface QuickDocModalProps {
  docType: QuickDocType;
  student: Student;
  user: User;
  school?: SchoolConfig | null;
  onClose: () => void;
}

// Gera código de identificação do documento (não auditável, sem hash)
function makeDocId(tipo: string, studentName: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let rand = '';
  for (let i = 0; i < 6; i++) rand += chars.charAt(Math.floor(Math.random() * chars.length));
  const date = new Date().toLocaleDateString('pt-BR').replace(/\//g, '');
  return `${tipo.substring(0, 3).toUpperCase()}-${rand}-${date}`;
}

export const QuickDocModal: React.FC<QuickDocModalProps> = ({
  docType, student, user, school, onClose,
}) => {
  const meta = DOC_META[docType];
  const today = new Date().toISOString().split('T')[0];
  const [generating, setGenerating] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({
    // Encaminhamento
    setor:         '',
    servico:       '',
    motivo_opcao:  '',
    motivo:        '',
    observacoes:   '',
    responsavel:   student.guardianName || '',
    // Convite
    data_horario:  '',
    local:         school?.schoolName || '',
    pauta:         'Acompanhamento pedagógico do aluno',
    profissional:  user.name,
    // Desligamento
    primeiro_dia_atendimento: '',
    ultimo_dia_atendimento:   today,
    motivo_complemento:       '',
    evolucao:                 '',
    recomendacoes:            '',
    data:                     today,
  });

  const set = (k: string, v: string) => setFields(f => ({ ...f, [k]: v }));

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const auditCode = makeDocId(docType, student.name);
      const result = await PDFGenerator.generate({
        docType,
        student,
        user,
        school: school ?? null,
        filledData: fields,
        auditCode,
      });
      setBlob(result);
    } catch (e: any) {
      setError(e?.message || 'Erro ao gerar documento');
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!blob) return;
    const filename = `${docType}_${student.name.replace(/\s+/g, '_')}.pdf`;
    PDFGenerator.download(blob, filename);
  };

  // ── Form por tipo ─────────────────────────────────────────────────────────
  const renderForm = () => {
    switch (docType) {
      case 'encaminhamento_redes':
        return (
          <>
            <Field label="Setor / Serviço de Destino *" required>
              <input value={fields.setor} onChange={e => set('setor', e.target.value)}
                placeholder="Ex: CRAS, CAPS, UBS, Fonoaudiologia, Psicologia..." style={inputStyle} />
            </Field>
            <Field label="Serviço Específico">
              <input value={fields.servico} onChange={e => set('servico', e.target.value)}
                placeholder="Opcional" style={inputStyle} />
            </Field>
            <Field label="Responsável Legal">
              <input value={fields.responsavel} onChange={e => set('responsavel', e.target.value)}
                placeholder="Nome do responsável" style={inputStyle} />
            </Field>
            <Field label="Motivo do Encaminhamento *" required>
              <select value={fields.motivo_opcao} onChange={e => set('motivo_opcao', e.target.value)} style={inputStyle}>
                <option value="">Selecionar...</option>
                <option>Avaliação neuropsicológica</option>
                <option>Acompanhamento fonoaudiológico</option>
                <option>Acompanhamento psicológico</option>
                <option>Acompanhamento médico/neurológico</option>
                <option>Apoio assistência social</option>
                <option>Terapia ocupacional</option>
                <option>Fisioterapia</option>
                <option>Outros</option>
              </select>
            </Field>
            <Field label="Detalhamento / Justificativa">
              <textarea value={fields.motivo} onChange={e => set('motivo', e.target.value)}
                rows={3} placeholder="Descreva os motivos pedagógicos e observações clínicas relevantes..."
                style={{ ...inputStyle, resize: 'vertical' }} />
            </Field>
            <Field label="Observações Complementares">
              <textarea value={fields.observacoes} onChange={e => set('observacoes', e.target.value)}
                rows={2} placeholder="Opcional" style={{ ...inputStyle, resize: 'vertical' }} />
            </Field>
          </>
        );

      case 'convite_reuniao':
        return (
          <>
            <Field label="Data e Horário *" required>
              <input value={fields.data_horario} onChange={e => set('data_horario', e.target.value)}
                placeholder="Ex: 20/03/2026 às 14h00" style={inputStyle} />
            </Field>
            <Field label="Local">
              <input value={fields.local} onChange={e => set('local', e.target.value)}
                placeholder="Nome da escola ou sala" style={inputStyle} />
            </Field>
            <Field label="Pauta / Assunto *" required>
              <textarea value={fields.pauta} onChange={e => set('pauta', e.target.value)}
                rows={3} placeholder="Descreva os tópicos da reunião..." style={{ ...inputStyle, resize: 'vertical' }} />
            </Field>
            <Field label="Profissional Responsável">
              <input value={fields.profissional} onChange={e => set('profissional', e.target.value)}
                placeholder="Nome do profissional" style={inputStyle} />
            </Field>
          </>
        );

      case 'termo_desligamento':
        return (
          <>
            <div style={{ background: '#FFF7ED', border: '1px solid #FDBA74', borderRadius: 10, padding: '10px 14px', marginBottom: 14, display: 'flex', gap: 8 }}>
              <AlertCircle size={14} style={{ color: '#9A3412', flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontSize: 12, color: '#9A3412', lineHeight: 1.4 }}>
                Este documento encerra formalmente o vínculo do aluno com a Sala de Recursos Multifuncionais. Certifique-se de que a decisão passou pelo Conselho Pedagógico.
              </span>
            </div>
            <Field label="Data do Primeiro Atendimento">
              <input type="date" value={fields.primeiro_dia_atendimento}
                onChange={e => set('primeiro_dia_atendimento', e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Data do Último Atendimento">
              <input type="date" value={fields.ultimo_dia_atendimento}
                onChange={e => set('ultimo_dia_atendimento', e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Motivo do Desligamento *" required>
              <select value={fields.motivo_opcao} onChange={e => set('motivo_opcao', e.target.value)} style={inputStyle}>
                <option value="">Selecionar...</option>
                <option>Alcançou os objetivos do AEE</option>
                <option>Transferência de escola</option>
                <option>Solicitação da família</option>
                <option>Conclusão da escolarização</option>
                <option>Outros</option>
              </select>
            </Field>
            <Field label="Detalhamento do Motivo">
              <textarea value={fields.motivo_complemento} onChange={e => set('motivo_complemento', e.target.value)}
                rows={2} placeholder="Opcional" style={{ ...inputStyle, resize: 'vertical' }} />
            </Field>
            <Field label="Síntese da Evolução do Aluno *" required>
              <textarea value={fields.evolucao} onChange={e => set('evolucao', e.target.value)}
                rows={4} placeholder="Descreva o progresso e desenvolvimento observados durante o período de atendimento..."
                style={{ ...inputStyle, resize: 'vertical' }} />
            </Field>
            <Field label="Recomendações Finais">
              <textarea value={fields.recomendacoes} onChange={e => set('recomendacoes', e.target.value)}
                rows={3} placeholder="Orientações para continuidade do suporte ao aluno após o desligamento..."
                style={{ ...inputStyle, resize: 'vertical' }} />
            </Field>
          </>
        );
    }
  };

  // Validação básica de campos obrigatórios
  const isValid = docType === 'encaminhamento_redes'
    ? fields.setor.trim().length > 0 && fields.motivo_opcao.trim().length > 0
    : docType === 'convite_reuniao'
    ? fields.data_horario.trim().length > 0 && fields.pauta.trim().length > 0
    : fields.motivo_opcao.trim().length > 0 && fields.evolucao.trim().length > 0;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1100,
      background: 'rgba(28,32,46,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        background: C.surface, borderRadius: 20, width: '100%', maxWidth: 580,
        maxHeight: '92vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(28,32,46,0.35)',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 22px 14px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: meta.bg, color: meta.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {meta.icon}
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: C.dark, margin: '0 0 1px' }}>{meta.title}</h2>
              <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>{student.name}</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
          {/* Bloco do aluno */}
          <div style={{ background: C.bg, borderRadius: 10, padding: '10px 14px', marginBottom: 18, display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              background: `linear-gradient(135deg, ${C.petrol}, ${C.dark})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 800, color: '#fff',
            }}>
              {student.name.charAt(0).toUpperCase()}
            </div>
            <div style={{ fontSize: 12, color: C.muted }}>
              <span style={{ fontWeight: 700, color: C.dark }}>{student.name}</span>
              {student.grade && <span> · {student.grade}</span>}
              {student.shift && <span> · {student.shift}</span>}
            </div>
          </div>

          {/* Formulário */}
          {renderForm()}

          {/* Erro */}
          {error && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 9, padding: '10px 14px', marginTop: 14, color: C.red, fontSize: 12, display: 'flex', gap: 8 }}>
              <AlertCircle size={14} style={{ flexShrink: 0 }} />
              {error}
            </div>
          )}

          {/* Sucesso */}
          {blob && !error && (
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 9, padding: '12px 16px', marginTop: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              <CheckCircle2 size={16} color={C.green} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: '#166534', fontWeight: 600, flex: 1 }}>
                Documento gerado com sucesso!
              </span>
              <button
                onClick={handleDownload}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
                  borderRadius: 8, border: 'none', background: C.petrol,
                  color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer',
                }}
              >
                <Download size={13} /> Baixar PDF
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 22px', borderTop: `1px solid ${C.border}`, flexShrink: 0,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <button onClick={onClose} style={{
            padding: '9px 18px', borderRadius: 9, border: `1.5px solid ${C.border}`,
            background: 'transparent', color: C.muted, fontWeight: 600, fontSize: 13, cursor: 'pointer',
          }}>
            {blob ? 'Fechar' : 'Cancelar'}
          </button>

          {!blob && (
            <button
              onClick={handleGenerate}
              disabled={!isValid || generating}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '9px 22px',
                borderRadius: 9, border: 'none',
                background: isValid && !generating
                  ? `linear-gradient(135deg, ${C.petrol}, ${C.dark})`
                  : C.border,
                color: isValid && !generating ? '#fff' : C.muted,
                fontWeight: 700, fontSize: 13,
                cursor: isValid && !generating ? 'pointer' : 'not-allowed',
              }}
            >
              {generating
                ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Gerando…</>
                : <><Download size={14} /> Gerar Documento</>}
            </button>
          )}

          {blob && (
            <button
              onClick={handleDownload}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '9px 22px',
                borderRadius: 9, border: 'none',
                background: `linear-gradient(135deg, ${C.petrol}, ${C.dark})`,
                color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
              }}
            >
              <Download size={14} /> Baixar PDF
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Micro-helpers ────────────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 9, fontSize: 13,
  border: `1.5px solid #E7E2D8`, outline: 'none', color: '#2E3A59',
  boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff',
};

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: '#667085', display: 'block', marginBottom: 5 }}>
        {label}
        {required && <span style={{ color: '#EF4444' }}> *</span>}
      </label>
      {children}
    </div>
  );
}
