import React, { useEffect, useState } from 'react';
import { AlertCircle, X, Zap } from 'lucide-react';
import { supabase } from '../services/supabase';
import { Link } from 'react-router-dom'; // Ajuste conforme seu router

export const UserAlertsBanner = ({ tenantId, aiCreditsRemaining }: { tenantId?: string, aiCreditsRemaining?: number }) => {
  const [alerts, setAlerts] = useState<any[]>([]);

  useEffect(() => {
    if (!tenantId) return;
    const fetchAlerts = async () => {
      const { data } = await supabase
        .from('tenant_alerts')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_read', false);
      if (data) setAlerts(data);
    };
    fetchAlerts();
  }, [tenantId]);

  const dismiss = async (id: string) => {
    await supabase.from('tenant_alerts').update({ is_read: true }).eq('id', id);
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  return (
    <div className="flex flex-col gap-2 p-4 w-full max-w-5xl mx-auto">
      {/* Alerta de Créditos Baixos - Automático */}
      {typeof aiCreditsRemaining === 'number' && aiCreditsRemaining <= 20 && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-xl flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <Zap size={18} className="text-red-500 shrink-0" />
            <span className="text-sm font-medium">Atenção: Você tem apenas {aiCreditsRemaining} créditos IA restantes.</span>
          </div>
          {/* Renderiza botão se a rota Settings existir ou envia para checkout */}
          <button className="text-xs font-bold bg-white text-red-600 px-3 py-1.5 rounded-lg border border-red-200 hover:bg-red-50 transition">
            Obter Créditos
          </button>
        </div>
      )}

      {/* Alertas Manuais do CEO */}
      {alerts.map(alert => (
        <div key={alert.id} className="bg-orange-50 border border-orange-200 text-orange-800 px-4 py-3 rounded-xl flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <AlertCircle size={18} className="text-orange-500 shrink-0" />
            <span className="text-sm font-medium">{alert.message}</span>
          </div>
          <button onClick={() => dismiss(alert.id)} className="text-orange-400 hover:text-orange-600 p-1 rounded-lg">
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
};