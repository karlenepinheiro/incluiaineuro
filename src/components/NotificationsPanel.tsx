/**
 * NotificationsPanel.tsx
 * Sino indicador de mensagens não lidas no header.
 * Clicar redireciona para a tela de Mensagens — não abre mais painel pequeno.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { Bell } from 'lucide-react';
import { StudentSearchService } from '../services/studentSearchService';

interface Props {
  refreshTrigger?: number;
  onNavigate?: (view: string) => void;
}

export const NotificationsPanel: React.FC<Props> = ({ refreshTrigger, onNavigate }) => {
  const [unread, setUnread] = useState(0);

  const loadCount = useCallback(async () => {
    try {
      const cnt = await StudentSearchService.getUnreadCount();
      setUnread(cnt);
    } catch {
      // silencioso
    }
  }, []);

  useEffect(() => { loadCount(); }, [loadCount, refreshTrigger]);

  // Polling leve: atualiza contagem a cada 60s
  useEffect(() => {
    const id = setInterval(loadCount, 60_000);
    return () => clearInterval(id);
  }, [loadCount]);

  const handleClick = () => {
    if (onNavigate) {
      onNavigate('messages');
    }
  };

  return (
    <button
      onClick={handleClick}
      className="relative flex items-center justify-center w-9 h-9 rounded-xl transition-colors hover:bg-white/10"
      title={unread > 0 ? `${unread} mensagem${unread > 1 ? 's' : ''} não lida${unread > 1 ? 's' : ''}` : 'Mensagens'}
    >
      <Bell size={19} color="white" />
      {unread > 0 && (
        <span
          className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-white text-xs font-bold flex items-center justify-center"
          style={{ background: '#EF4444', fontSize: 10 }}
        >
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </button>
  );
};
