import React, { useMemo } from 'react';
import {
  Users,
  FileText,
  Settings,
  LogOut,
  Brain,
  Home,
  FileSearch,
  GraduationCap,
  ClipboardList,
  PieChart,
  LayoutTemplate,
  FileEdit,
  Activity,
  CreditCard,
  Calendar,
  FlaskConical,
  MessageSquare,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';

import { User, getPlanLimits, PlanTier } from '../types';
import { cn } from '@/src/lib/utils';
import { Badge } from '@/src/components/ui/badge';
import { Progress } from '@/src/components/ui/progress';
import { Separator } from '@/src/components/ui/separator';

interface SidebarProps {
  user: User;
  currentView: string;
  setView: (view: any) => void;
  isOpen: boolean;
  onLogout: () => void;
  studentCount: number;
  protocolCount: number;
  hasFinalCaseStudy?: boolean;
  planMaxStudents?: number;
  triagemCount?: number;
  unreadMessages?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  user,
  currentView,
  setView,
  isOpen,
  onLogout,
  studentCount,
  planMaxStudents,
  triagemCount = 0,
  unreadMessages = 0,
}) => {
  const limits = getPlanLimits(user.plan);
  const isPremium = user.plan === PlanTier.PREMIUM;
  const isPro     = user.plan === PlanTier.PRO;
  const isPaid    = isPro || isPremium; // PRO ou PREMIUM — qualquer plano pago

  const maxStudents =
    typeof planMaxStudents === 'number' && planMaxStudents > 0
      ? planMaxStudents
      : ((limits as any)?.students ?? 0);

  const planLabel = useMemo(() => {
    const p = user.plan;
    if (p === PlanTier.FREE) return 'FREE';
    if (p === PlanTier.PRO) return 'PRO';
    if (p === PlanTier.PREMIUM) return 'PREMIUM';
    return String(p ?? '').split(' ')[0] || 'FREE';
  }, [user.plan]);

  const safeMax = typeof maxStudents === 'number' && maxStudents > 0 ? maxStudents : 0;
  const usagePct = safeMax > 0 ? Math.min(100, (studentCount / safeMax) * 100) : 0;

  const LockedNavItem = ({
    icon: Icon,
    label,
  }: {
    icon: any;
    label: string;
  }) => (
    <button
      onClick={() => setView('subscription')}
      title="Disponível apenas no plano PREMIUM — clique para fazer upgrade"
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 opacity-50 cursor-pointer hover:opacity-75"
    >
      <Icon size={18} className="shrink-0 text-gray-400" />
      <span className="whitespace-nowrap flex-1 text-left text-gray-400">{label}</span>
      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
        PREMIUM
      </span>
    </button>
  );

  /** Item bloqueado para planos FREE — requer PRO ou PREMIUM */
  const LockedNavItemPro = ({
    icon: Icon,
    label,
  }: {
    icon: any;
    label: string;
  }) => (
    <button
      onClick={() => setView('subscription')}
      title="Disponível a partir do plano PRO — clique para fazer upgrade"
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 opacity-50 cursor-pointer hover:opacity-75"
    >
      <Icon size={18} className="shrink-0 text-gray-400" />
      <span className="whitespace-nowrap flex-1 text-left text-gray-400">{label}</span>
      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
        PRO
      </span>
    </button>
  );

  const NavItem = ({
    viewId,
    icon: Icon,
    label,
    badge,
    title,
  }: {
    viewId: string;
    icon: any;
    label: string;
    badge?: string;
    title?: string;
  }) => (
    <button
      onClick={() => setView(viewId)}
      title={title}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
        currentView === viewId
          ? 'bg-petrol text-white shadow-sm'
          : 'text-gray-500 hover:bg-petrol/10 hover:text-petrol'
      )}
    >
      <Icon size={18} className="shrink-0" />
      <span className="whitespace-nowrap flex-1 text-left">{label}</span>
      {badge && (
        <span className={cn(
          'text-[9px] font-bold px-1.5 py-0.5 rounded-full',
          currentView === viewId
            ? 'bg-white/20 text-white'
            : 'bg-petrol/10 text-petrol'
        )}>
          {badge}
        </span>
      )}
    </button>
  );

  return (
    <aside
      className={cn(
        'bg-surface border-r border-border fixed lg:static inset-y-0 left-0 z-40 transition-all duration-300 flex flex-col print:hidden',
        isOpen
          ? 'translate-x-0 w-64'
          : '-translate-x-full lg:translate-x-0 w-64 lg:w-0 lg:overflow-hidden lg:border-none'
      )}
    >
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-border shrink-0">
        <BrandLogo fontSize={18} iconSize={16} />
      </div>

      {/* Plano / alunos */}
      {user.isAdmin ? (
        <div
          className="px-4 py-4 border-b border-border/30 shrink-0"
          style={{ background: 'linear-gradient(135deg, #1F4E5F 0%, #2E3A59 100%)' }}
        >
          <div className="flex items-center gap-2 mb-1">
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: '#C69214', textTransform: 'uppercase' }}>
              Painel CEO
            </span>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
          </div>
          <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 500, whiteSpace: 'nowrap' }}>
            Administração do Sistema
          </div>
        </div>
      ) : (
        <div className="px-4 py-4 bg-bg-app border-b border-border shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Plano</span>
            <Badge variant="outline" className="text-[10px] font-bold px-1.5 py-0 border-petrol/30 text-petrol">
              {planLabel}
            </Badge>
          </div>
          <div className="flex items-center justify-between text-[10px] font-semibold text-gray-500 mb-1.5">
            <span>Alunos</span>
            <span>{studentCount} / {safeMax}</span>
          </div>
          <Progress value={usagePct} className="h-1.5" />
        </div>
      )}

      {/* Navegação */}
      <div className="flex-1 py-4 px-3 overflow-y-auto custom-scrollbar">
        {user.isAdmin && currentView === 'admin' ? (
          <nav className="space-y-1">
            <div className="px-3 mb-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              Gestão Executiva
            </div>
            <NavItem viewId="admin" icon={PieChart} label="Visão Estratégica" />
          </nav>
        ) : (
          <nav className="space-y-1">
            {/* Geral */}
            <div className="px-3 mb-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">
              Geral
            </div>
            <NavItem viewId="dashboard"   icon={Home}     label="Dashboard" />
            <NavItem viewId="students"    icon={Users}    label="Alunos" />
            <NavItem viewId="appointments" icon={Calendar} label="Agenda" />

            {/* Documentação pedagógica */}
            <div className="pt-4 px-3 mb-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">
              Documentação
            </div>
            <NavItem viewId="estudo_caso" icon={FileSearch}    label="Estudo de Caso" />
            <NavItem viewId="paee"        icon={ClipboardList} label="PAEE (uso exclusivo do AEE)"  title="Documento exclusivo para professores do Atendimento Educacional Especializado (AEE)" />
            <NavItem viewId="protocols"   icon={FileText}      label="PEI" />
            <NavItem viewId="pdi"         icon={GraduationCap} label="PDI (opcional)"               title="Documento opcional para planejamento individual complementar" />
            {isPaid
              ? <NavItem viewId="school_templates" icon={LayoutTemplate} label="Meus Modelos" />
              : <LockedNavItemPro icon={LayoutTemplate} label="Meus Modelos" />
            }

            {/* Ferramentas IA */}
            <div className="pt-4 px-3 mb-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">
              Ferramentas IA
            </div>
            {isPaid
              ? <NavItem viewId="incluilab" icon={FlaskConical} label="Laboratório de Adaptações" />
              : <LockedNavItemPro icon={FlaskConical} label="Laboratório de Adaptações" />
            }
            {isPaid
              ? <NavItem viewId="incluilab_library" icon={FileText} label="Biblioteca IncluiLAB" />
              : <LockedNavItemPro icon={FileText} label="Biblioteca IncluiLAB" />
            }

            {/* Avaliação & Histórico */}
            <div className="pt-4 px-3 mb-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">
              Avaliação & Histórico
            </div>
            {isPaid
              ? <NavItem viewId="reports" icon={Brain} label="Perfil Cognitivo" />
              : <LockedNavItemPro icon={Brain} label="Perfil Cognitivo" />
            }
            {isPremium
              ? <NavItem viewId="service_control" icon={Activity} label="Controle de Atendimento" />
              : <LockedNavItem icon={Activity} label="Controle de Atendimento" />
            }
            {isPremium
              ? <NavItem viewId="fichas" icon={FileEdit} label="Fichas Complementares" />
              : <LockedNavItem icon={FileEdit} label="Fichas Complementares" />
            }

            {/* Rodapé */}
            <div className="pt-4 mt-2">
              <Separator className="mb-3" />
              <NavItem viewId="subscription" icon={CreditCard}     label="Assinatura & Créditos" />
              <NavItem viewId="settings"     icon={Settings}       label="Configurações" />
              <NavItem
                viewId="messages"
                icon={MessageSquare}
                label="Mensagens"
                badge={unreadMessages > 0 ? String(unreadMessages > 9 ? '9+' : unreadMessages) : undefined}
              />
              {user.isAdmin && (
                <NavItem viewId="admin" icon={PieChart} label="Painel CEO" />
              )}
            </div>
          </nav>
        )}
      </div>

      {/* Usuário */}
      <div className="p-4 border-t border-border bg-bg-app shrink-0">
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #1F4E5F, #2E3A59)' }}
          >
            {(user as any).profilePhoto ? (
              <img src={(user as any).profilePhoto} alt="foto" className="w-full h-full object-cover" />
            ) : (
              (user.name || 'U').substring(0, 2).toUpperCase()
            )}
          </div>
          <div className="overflow-hidden flex-1">
            <p className="text-sm font-bold text-gray-900 truncate">{user.name || 'Usuário'}</p>
            <p className="text-xs text-gray-500 truncate">
              {user.isAdmin ? 'Super Admin' : planLabel}
            </p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-red-500 hover:bg-red-50 hover:text-red-600 rounded-lg text-sm font-medium transition-all"
        >
          <LogOut size={15} />
          <span className="whitespace-nowrap">Sair da Conta</span>
        </button>
      </div>
    </aside>
  );
};
