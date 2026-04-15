/**
 * SchoolSetupBanner.tsx
 * Banner não-bloqueante que aparece quando a escola ainda não foi configurada
 * (ou está incompleta). Exibe os dados já preenchidos e convida o usuário
 * a finalizar as informações em Configurações.
 *
 * Regra de exibição:
 *  - Oculto se: schoolName + managerName + contact estiverem preenchidos
 *  - Dispensável via botão X (armazena em localStorage por 24h)
 *  - Sempre visível novamente se a escola ainda não tiver nome
 */
import React, { useState } from 'react';
import {
  Building2, ChevronRight, X, CheckCircle2,
  AlertCircle, Users, Phone,
} from 'lucide-react';
import type { SchoolConfig, TeamMember } from '../types';

const DISMISS_KEY  = 'incluiai_school_banner_dismissed_until';
const DISMISS_HOURS = 24;

function isDismissed(): boolean {
  const v = localStorage.getItem(DISMISS_KEY);
  if (!v) return false;
  return Date.now() < Number(v);
}

function dismiss() {
  localStorage.setItem(
    DISMISS_KEY,
    String(Date.now() + DISMISS_HOURS * 3_600_000),
  );
}

interface Props {
  school: SchoolConfig | undefined | null;
  onGoToSettings: () => void;
}

export const SchoolSetupBanner: React.FC<Props> = ({ school, onGoToSettings }) => {
  const [hidden, setHidden] = useState(isDismissed);

  // Calcula quais campos estão preenchidos
  const hasName    = !!school?.schoolName?.trim();
  const hasManager = !!school?.managerName?.trim();
  const hasContact = !!school?.contact?.trim();
  const hasAee     = !!school?.aeeRepresentative?.trim();
  const team: TeamMember[] = school?.team ?? [];
  const teamCount  = team.length;

  // Completo = tem nome + gestor + contato
  const isComplete = hasName && hasManager && hasContact;

  // Não exibe se completo OU dispensado (com nome já salvo)
  if (isComplete) return null;
  if (hidden && hasName) return null; // pode dispensar apenas se nome existir

  const handleDismiss = () => {
    dismiss();
    setHidden(true);
  };

  // Itens de progresso
  const steps = [
    { label: 'Nome da escola',   done: hasName    },
    { label: 'Gestor(a)',        done: hasManager  },
    { label: 'Contato',         done: hasContact  },
    { label: 'Professor de AEE', done: hasAee      },
    { label: `Equipe (${teamCount} membro${teamCount !== 1 ? 's' : ''})`, done: teamCount > 0 },
  ];

  const doneCt = steps.filter(s => s.done).length;
  const pct    = Math.round((doneCt / steps.length) * 100);

  return (
    <div
      className="mx-4 mt-4 mb-0 rounded-2xl overflow-hidden print:hidden"
      style={{
        border: '1.5px solid #BFDBFE',
        background: 'linear-gradient(135deg, #EFF6FF 0%, #F0F9FF 100%)',
        boxShadow: '0 2px 8px rgba(30, 64, 175, 0.07)',
      }}
    >
      {/* Barra de progresso */}
      <div className="h-1 w-full" style={{ background: '#DBEAFE' }}>
        <div
          className="h-full transition-all duration-700"
          style={{
            width: `${pct}%`,
            background: pct === 100
              ? 'linear-gradient(90deg, #059669, #10B981)'
              : 'linear-gradient(90deg, #1F4E5F, #2563EB)',
          }}
        />
      </div>

      <div className="flex items-start gap-4 px-5 py-4">
        {/* Ícone */}
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: '#DBEAFE' }}
        >
          <Building2 size={20} color="#1D4ED8" />
        </div>

        {/* Conteúdo principal */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="font-bold text-sm" style={{ color: '#1E3A5F' }}>
              {hasName
                ? `Finalize as informações da escola — ${school!.schoolName}`
                : 'Configure sua escola para começar'}
            </p>
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full shrink-0"
              style={{ background: '#DBEAFE', color: '#1D4ED8' }}
            >
              {pct}%
            </span>
          </div>

          <p className="text-xs mb-3" style={{ color: '#3B82F6' }}>
            {hasName
              ? 'Adicione gestor, contato e equipe para que seus documentos saiam completos.'
              : 'Informe o nome da escola e dados da equipe. Não é obrigatório agora, mas aparecerá nos seus documentos.'}
          </p>

          {/* Checklist de campos */}
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 mb-4">
            {steps.map(s => (
              <div key={s.label} className="flex items-center gap-1.5 text-xs">
                {s.done
                  ? <CheckCircle2 size={13} color="#059669" />
                  : <AlertCircle   size={13} color="#93C5FD" />}
                <span style={{ color: s.done ? '#065F46' : '#60A5FA' }}>{s.label}</span>
              </div>
            ))}
          </div>

          {/* Dados já preenchidos (preview) */}
          {hasName && (
            <div
              className="flex flex-wrap gap-3 mb-4 p-3 rounded-xl text-xs"
              style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid #BFDBFE' }}
            >
              {school?.schoolName && (
                <div className="flex items-center gap-1.5" style={{ color: '#1E3A5F' }}>
                  <Building2 size={12} />
                  <span className="font-semibold">{school.schoolName}</span>
                </div>
              )}
              {hasManager && (
                <div className="flex items-center gap-1.5" style={{ color: '#374151' }}>
                  <Users size={12} />
                  <span>{school!.managerName}</span>
                </div>
              )}
              {hasContact && (
                <div className="flex items-center gap-1.5" style={{ color: '#374151' }}>
                  <Phone size={12} />
                  <span>{school!.contact}</span>
                </div>
              )}
              {teamCount > 0 && (
                <div className="flex items-center gap-1.5" style={{ color: '#374151' }}>
                  <Users size={12} />
                  <span>{teamCount} membro{teamCount !== 1 ? 's' : ''} na equipe</span>
                </div>
              )}
            </div>
          )}

          {/* CTA */}
          <button
            onClick={onGoToSettings}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #1F4E5F, #1D4ED8)' }}
          >
            <Building2 size={15} />
            {hasName ? 'Finalizar configuração da escola' : 'Configurar escola agora'}
            <ChevronRight size={15} />
          </button>
        </div>

        {/* Botão dispensar — só disponível se já tiver nome */}
        {hasName && (
          <button
            onClick={handleDismiss}
            className="shrink-0 text-blue-300 hover:text-blue-500 transition-colors mt-0.5"
            title="Fechar por 24h"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
};
