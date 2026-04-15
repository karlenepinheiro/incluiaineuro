/**
 * NotificationsPanel.tsx
 * Painel de notificações flutuante (sino no header/sidebar).
 * Mostra notificações do sistema: importação de alunos, acessos ao prontuário, etc.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { Bell, X, CheckCheck, ShieldAlert, UserPlus, ChevronRight, Loader2 } from 'lucide-react';
import { StudentSearchService, type AppNotification } from '../services/studentSearchService';

const C = {
  petrol:  '#1F4E5F',
  gold:    '#C69214',
  dark:    '#2E3A59',
  bg:      '#F6F4EF',
  surface: '#FFFFFF',
  border:  '#E7E2D8',
  gray:    '#6B7280',
};

const TYPE_ICON: Record<string, React.ReactNode> = {
  student_imported: <UserPlus size={15} color="#059669" />,
  student_accessed: <ShieldAlert size={15} color="#D97706" />,
};

const TYPE_COLOR: Record<string, string> = {
  student_imported: '#ECFDF5',
  student_accessed: '#FFFBEB',
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'agora';
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

interface Props {
  /** Força recarregar ao mudar (ex: após importar aluno) */
  refreshTrigger?: number;
}

export const NotificationsPanel: React.FC<Props> = ({ refreshTrigger }) => {
  const [open, setOpen]             = useState(false);
  const [notifications, setNots]    = useState<AppNotification[]>([]);
  const [unread, setUnread]         = useState(0);
  const [loading, setLoading]       = useState(false);
  const [marking, setMarking]       = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nots, cnt] = await Promise.all([
        StudentSearchService.getNotifications(),
        StudentSearchService.getUnreadCount(),
      ]);
      setNots(nots);
      setUnread(cnt);
    } catch {
      // silencioso
    } finally {
      setLoading(false);
    }
  }, []);

  // Carrega ao montar e sempre que refreshTrigger muda
  useEffect(() => { load(); }, [load, refreshTrigger]);

  // Polling leve: a cada 60s verifica novas notificações
  useEffect(() => {
    const id = setInterval(() => {
      StudentSearchService.getUnreadCount().then(setUnread).catch(() => {});
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const handleOpen = () => {
    setOpen(o => !o);
    if (!open) load();
  };

  const handleMarkAllRead = async () => {
    if (marking) return;
    setMarking(true);
    await StudentSearchService.markRead();
    setUnread(0);
    setNots(prev => prev.map(n => ({ ...n, read: true })));
    setMarking(false);
  };

  const handleMarkOne = async (id: string) => {
    await StudentSearchService.markRead(id);
    setNots(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    setUnread(prev => Math.max(0, prev - 1));
  };

  return (
    <div className="relative">
      {/* Botão sino */}
      <button
        onClick={handleOpen}
        className="relative flex items-center justify-center w-9 h-9 rounded-xl transition-colors hover:bg-white/10"
        title="Notificações"
      >
        <Bell size={19} color={open ? C.gold : 'white'} />
        {unread > 0 && (
          <span
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-white text-xs font-bold flex items-center justify-center"
            style={{ background: '#EF4444', fontSize: 10 }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Painel */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />

          <div
            className="absolute right-0 top-11 z-50 w-80 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            style={{ background: C.surface, border: `1px solid ${C.border}` }}
          >
            {/* Header do painel */}
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: `1px solid ${C.border}` }}
            >
              <div className="flex items-center gap-2">
                <Bell size={15} style={{ color: C.petrol }} />
                <span className="font-bold text-sm" style={{ color: C.dark }}>Notificações</span>
                {unread > 0 && (
                  <span
                    className="px-1.5 py-0.5 rounded-full text-xs font-bold text-white"
                    style={{ background: C.petrol }}
                  >
                    {unread}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unread > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    disabled={marking}
                    className="flex items-center gap-1 text-xs font-medium transition-opacity disabled:opacity-50"
                    style={{ color: C.petrol }}
                    title="Marcar todas como lidas"
                  >
                    <CheckCheck size={13} />
                    Lidas
                  </button>
                )}
                <button onClick={() => setOpen(false)}>
                  <X size={16} style={{ color: C.gray }} />
                </button>
              </div>
            </div>

            {/* Lista */}
            <div className="overflow-y-auto" style={{ maxHeight: 340 }}>
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 size={24} className="animate-spin" style={{ color: C.petrol }} />
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center py-10 gap-2 text-center px-4">
                  <Bell size={28} style={{ color: C.border }} />
                  <p className="text-xs" style={{ color: C.gray }}>Nenhuma notificação ainda.</p>
                </div>
              ) : (
                notifications.map(n => (
                  <button
                    key={n.id}
                    onClick={() => !n.read && handleMarkOne(n.id)}
                    className="w-full text-left flex items-start gap-3 px-4 py-3 transition-colors hover:bg-gray-50"
                    style={{
                      borderBottom: `1px solid ${C.border}`,
                      background: n.read ? 'transparent' : TYPE_COLOR[n.type] ?? '#F0F9FF',
                    }}
                  >
                    {/* Ícone */}
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: n.read ? '#F3F4F6' : (TYPE_COLOR[n.type] ?? '#EFF6FF') }}
                    >
                      {TYPE_ICON[n.type] ?? <Bell size={14} style={{ color: C.petrol }} />}
                    </div>

                    {/* Conteúdo */}
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-xs font-semibold leading-snug truncate"
                        style={{ color: n.read ? C.gray : C.dark }}
                      >
                        {n.title}
                      </p>
                      <p className="text-xs mt-0.5 leading-snug line-clamp-2" style={{ color: C.gray }}>
                        {n.body}
                      </p>
                      <p className="text-xs mt-1" style={{ color: C.border, fontSize: 10 }}>
                        {formatRelative(n.created_at)}
                      </p>
                    </div>

                    {!n.read && (
                      <div className="w-2 h-2 rounded-full shrink-0 mt-2" style={{ background: C.petrol }} />
                    )}
                  </button>
                ))
              )}
            </div>

            {/* Protocolo: link para ver todos */}
            {notifications.length > 0 && (
              <div
                className="flex items-center justify-center gap-1 py-2 text-xs font-medium"
                style={{ borderTop: `1px solid ${C.border}`, color: C.petrol }}
              >
                <ChevronRight size={13} />
                Ver protocolos de acesso em Configurações
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
