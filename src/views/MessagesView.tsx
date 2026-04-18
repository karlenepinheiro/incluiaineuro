import React, { useEffect, useState, useCallback } from 'react';
import {
  Bell, UserPlus, ShieldAlert, FileText, AlertTriangle,
  CheckCheck, CheckCircle2, User, Loader2, Inbox,
  ChevronRight, Clock,
} from 'lucide-react';
import { StudentSearchService, type AppNotification } from '../services/studentSearchService';

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  petrol:  '#1F4E5F',
  gold:    '#C69214',
  dark:    '#2E3A59',
  bg:      '#F6F4EF',
  surface: '#FFFFFF',
  border:  '#E7E2D8',
  gray:    '#6B7280',
  gray2:   '#9CA3AF',
};

// ─── Tipo de mensagem: metadados visuais e textuais ───────────────────────────

interface MessageMeta {
  icon: React.ReactNode;
  label: string;
  bgColor: string;
  iconBg: string;
}

function getMeta(type: string): MessageMeta {
  switch (type) {
    case 'student_imported':
      return {
        icon: <UserPlus size={16} color="#059669" />,
        label: 'Aluno adicionado',
        bgColor: '#ECFDF5',
        iconBg: '#D1FAE5',
      };
    case 'student_accessed':
      return {
        icon: <ShieldAlert size={16} color="#D97706" />,
        label: 'Prontuário acessado',
        bgColor: '#FFFBEB',
        iconBg: '#FDE68A',
      };
    case 'protocol_generated':
      return {
        icon: <FileText size={16} color="#2563EB" />,
        label: 'Protocolo gerado',
        bgColor: '#EFF6FF',
        iconBg: '#DBEAFE',
      };
    case 'institutional_alert':
      return {
        icon: <AlertTriangle size={16} color="#DC2626" />,
        label: 'Alerta institucional',
        bgColor: '#FEF2F2',
        iconBg: '#FEE2E2',
      };
    default:
      return {
        icon: <Bell size={16} color={C.petrol} />,
        label: 'Notificação',
        bgColor: '#F0F9FF',
        iconBg: '#E0F2FE',
      };
  }
}

// ─── Formatadores ─────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'agora';
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `há ${d}d`;
  return formatDate(iso);
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface Props {
  onNavigate?: (view: string) => void;
}

export const MessagesView: React.FC<Props> = ({ onNavigate }) => {
  const [messages, setMessages]   = useState<AppNotification[]>([]);
  const [selected, setSelected]   = useState<AppNotification | null>(null);
  const [loading, setLoading]     = useState(true);
  const [acting, setActing]       = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const nots = await StudentSearchService.getNotifications();
      setMessages(nots);
      if (nots.length > 0 && !selected) {
        setSelected(nots[0]);
      }
    } catch {
      // silencioso
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const markRead = async (id: string) => {
    await StudentSearchService.markRead(id);
    setMessages(prev => prev.map(m => m.id === id ? { ...m, read: true } : m));
    setSelected(prev => prev?.id === id ? { ...prev, read: true } : prev);
  };

  const handleSelect = async (msg: AppNotification) => {
    setSelected(msg);
    if (!msg.read) await markRead(msg.id);
  };

  const handleMarkAllRead = async () => {
    setActing(true);
    await StudentSearchService.markRead();
    setMessages(prev => prev.map(m => ({ ...m, read: true })));
    setSelected(prev => prev ? { ...prev, read: true } : prev);
    setActing(false);
  };

  const unreadCount = messages.filter(m => !m.read).length;

  // ─── Layout ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 0 }}>
      {/* Cabeçalho da página */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold" style={{ color: C.dark }}>Mensagens</h1>
          <p className="text-sm mt-0.5" style={{ color: C.gray }}>
            Central de notificações e comunicados do sistema
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            disabled={acting}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition disabled:opacity-50"
            style={{ background: C.petrol, color: '#fff' }}
          >
            {acting
              ? <Loader2 size={14} className="animate-spin" />
              : <CheckCheck size={14} />}
            Marcar todas como lidas
          </button>
        )}
      </div>

      {/* Painel principal */}
      <div
        className="flex flex-1 rounded-2xl overflow-hidden"
        style={{ border: `1px solid ${C.border}`, background: C.surface, minHeight: 520 }}
      >
        {/* ── Lista lateral ── */}
        <div
          className="flex flex-col shrink-0 overflow-y-auto"
          style={{
            width: 300,
            borderRight: `1px solid ${C.border}`,
            background: C.bg,
          }}
        >
          {/* Header da lista */}
          <div
            className="px-4 py-3 flex items-center justify-between shrink-0"
            style={{ borderBottom: `1px solid ${C.border}`, background: C.surface }}
          >
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: C.gray }}>
              Todas as mensagens
            </span>
            {unreadCount > 0 && (
              <span
                className="text-xs font-bold px-1.5 py-0.5 rounded-full text-white"
                style={{ background: C.petrol }}
              >
                {unreadCount}
              </span>
            )}
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-3">
              <Loader2 size={24} className="animate-spin" style={{ color: C.petrol }} />
              <span className="text-xs" style={{ color: C.gray }}>Carregando...</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-3 px-6 py-12 text-center">
              <Inbox size={36} style={{ color: C.border }} />
              <p className="text-sm font-semibold" style={{ color: C.gray }}>Nenhuma mensagem</p>
              <p className="text-xs" style={{ color: C.gray2 }}>
                As notificações aparecerão aqui quando houver atividade.
              </p>
            </div>
          ) : (
            messages.map(msg => {
              const meta = getMeta(msg.type);
              const isActive = selected?.id === msg.id;
              return (
                <button
                  key={msg.id}
                  onClick={() => handleSelect(msg)}
                  className="w-full text-left flex items-start gap-3 px-4 py-3.5 transition-colors"
                  style={{
                    borderBottom: `1px solid ${C.border}`,
                    background: isActive
                      ? `${C.petrol}10`
                      : msg.read ? 'transparent' : meta.bgColor,
                    borderLeft: isActive ? `3px solid ${C.petrol}` : '3px solid transparent',
                  }}
                >
                  {/* Ícone */}
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: meta.iconBg }}
                  >
                    {meta.icon}
                  </div>

                  {/* Conteúdo resumido */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1">
                      <p
                        className="text-xs leading-snug"
                        style={{
                          color: msg.read ? C.gray : C.dark,
                          fontWeight: msg.read ? 500 : 700,
                          maxWidth: 160,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {msg.title}
                      </p>
                      {!msg.read && (
                        <div
                          className="w-2 h-2 rounded-full shrink-0 mt-1"
                          style={{ background: C.petrol }}
                        />
                      )}
                    </div>
                    <p
                      className="text-xs mt-0.5 line-clamp-2 leading-snug"
                      style={{ color: C.gray2 }}
                    >
                      {msg.body}
                    </p>
                    <p className="text-[10px] mt-1.5 flex items-center gap-1" style={{ color: C.gray2 }}>
                      <Clock size={9} />
                      {formatRelative(msg.created_at)}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* ── Área de leitura ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selected ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-4 px-8 text-center">
              <Bell size={48} style={{ color: C.border }} />
              <p className="text-base font-semibold" style={{ color: C.gray }}>
                Selecione uma mensagem para ler
              </p>
              <p className="text-sm" style={{ color: C.gray2 }}>
                Clique em uma mensagem na lista à esquerda para ver o conteúdo completo.
              </p>
            </div>
          ) : (
            <MessageDetail
              message={selected}
              onMarkRead={markRead}
              onNavigate={onNavigate}
            />
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Detalhe da mensagem ──────────────────────────────────────────────────────

interface DetailProps {
  message: AppNotification;
  onMarkRead: (id: string) => Promise<void>;
  onNavigate?: (view: string) => void;
}

const MessageDetail: React.FC<DetailProps> = ({ message, onMarkRead, onNavigate }) => {
  const [marking, setMarking] = useState(false);
  const [acknowledged, setAcknowledged] = useState(message.read);
  const meta = getMeta(message.type);

  useEffect(() => {
    setAcknowledged(message.read);
  }, [message.id, message.read]);

  const handleOk = async () => {
    setMarking(true);
    await onMarkRead(message.id);
    setAcknowledged(true);
    setMarking(false);
  };

  const hasStudentId   = !!message.data?.student_id;
  const hasProtocolId  = !!message.data?.protocol_id;
  const protocolCode   = message.data?.protocol_code ?? message.data?.protocol_id ?? null;
  const studentName    = message.data?.student_name ?? null;
  const schoolName     = message.data?.school_name ?? null;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header da mensagem */}
      <div className="px-8 py-6" style={{ borderBottom: `1px solid ${C.border}` }}>
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: meta.iconBg }}
          >
            {meta.icon}
          </div>
          <div>
            <span
              className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
              style={{ background: meta.bgColor, color: C.dark }}
            >
              {meta.label}
            </span>
          </div>
          {!acknowledged && (
            <span
              className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
              style={{ background: C.petrol }}
            >
              Não lida
            </span>
          )}
          {acknowledged && (
            <span
              className="ml-auto flex items-center gap-1 text-[10px] font-semibold"
              style={{ color: '#059669' }}
            >
              <CheckCircle2 size={12} />
              Lida
            </span>
          )}
        </div>

        <h2 className="text-xl font-extrabold leading-snug" style={{ color: C.dark }}>
          {message.title}
        </h2>

        {/* Metadados */}
        <div className="flex items-center gap-4 mt-3 flex-wrap">
          <span className="flex items-center gap-1.5 text-xs" style={{ color: C.gray }}>
            <Clock size={12} />
            {formatDate(message.created_at)} às {formatTime(message.created_at)}
          </span>
          {protocolCode && (
            <span className="flex items-center gap-1.5 text-xs font-mono" style={{ color: C.gray }}>
              <FileText size={12} />
              Protocolo: {protocolCode}
            </span>
          )}
          {schoolName && (
            <span className="flex items-center gap-1.5 text-xs" style={{ color: C.gray }}>
              <User size={12} />
              {schoolName}
            </span>
          )}
        </div>
      </div>

      {/* Corpo da mensagem */}
      <div className="flex-1 px-8 py-6">
        <div
          className="rounded-xl p-5 mb-6 text-sm leading-relaxed"
          style={{
            background: meta.bgColor,
            border: `1px solid ${C.border}`,
            color: C.dark,
            fontSize: 14,
            lineHeight: 1.7,
          }}
        >
          {message.body || 'Nenhum detalhe adicional disponível.'}
        </div>

        {/* Dados extras do aluno/protocolo */}
        {(studentName || hasStudentId || hasProtocolId) && (
          <div
            className="rounded-xl p-4 mb-6"
            style={{ background: C.bg, border: `1px solid ${C.border}` }}
          >
            <p className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: C.gray }}>
              Dados relacionados
            </p>
            {studentName && (
              <div className="flex items-center gap-2 mb-2">
                <User size={13} style={{ color: C.petrol }} />
                <span className="text-sm font-semibold" style={{ color: C.dark }}>{studentName}</span>
              </div>
            )}
            {protocolCode && (
              <div className="flex items-center gap-2">
                <FileText size={13} style={{ color: C.petrol }} />
                <span className="text-sm font-mono" style={{ color: C.gray }}>{protocolCode}</span>
              </div>
            )}
          </div>
        )}

        {/* Preparado para futuro: thread/histórico */}
        <div
          className="rounded-xl p-4"
          style={{ background: '#F8FAFC', border: `1px dashed ${C.border}` }}
        >
          <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: C.gray2 }}>
            Histórico de mensagens
          </p>
          <p className="text-xs" style={{ color: C.gray2 }}>
            Em breve: troca de mensagens entre professores e instituições.
          </p>
        </div>
      </div>

      {/* Ações */}
      <div
        className="px-8 py-4 flex items-center gap-3 flex-wrap shrink-0"
        style={{ borderTop: `1px solid ${C.border}`, background: C.bg }}
      >
        {!acknowledged && (
          <button
            onClick={handleOk}
            disabled={marking}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition disabled:opacity-50"
            style={{ background: C.petrol, color: '#fff' }}
          >
            {marking
              ? <Loader2 size={14} className="animate-spin" />
              : <CheckCircle2 size={14} />}
            OK, ciente
          </button>
        )}

        {hasStudentId && onNavigate && (
          <button
            onClick={() => onNavigate('students')}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition"
            style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.dark }}
          >
            <User size={14} />
            Ver aluno
            <ChevronRight size={13} style={{ color: C.gray2 }} />
          </button>
        )}

        {hasProtocolId && onNavigate && (
          <button
            onClick={() => onNavigate('documents')}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition"
            style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.dark }}
          >
            <FileText size={14} />
            Ver protocolo
            <ChevronRight size={13} style={{ color: C.gray2 }} />
          </button>
        )}

        {acknowledged && !hasStudentId && !hasProtocolId && (
          <span className="flex items-center gap-2 text-sm" style={{ color: C.gray }}>
            <CheckCircle2 size={14} style={{ color: '#059669' }} />
            Mensagem lida
          </span>
        )}
      </div>
    </div>
  );
};
