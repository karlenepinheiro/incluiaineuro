import React, { useEffect, useMemo, useState } from 'react';
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
  ListChecks,
  PieChart,
  LayoutTemplate,
  Activity,
  CreditCard,
  Calendar,
  FlaskConical,
  MessageSquare,
  MessageCircle,
  History,
  LifeBuoy,
  Printer,
  ChevronLeft,
  ChevronRight,
  Hand,
} from 'lucide-react';
import { BrandLogo, BRAND } from './BrandLogo';

import { User, PlanTier } from '../types';
import { waUrl } from '../config/contact';
import { cn } from '@/src/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/src/components/ui/tooltip';

/** Preferência de sidebar recolhida (somente desktop) — persistida localmente no navegador. */
const SIDEBAR_COLLAPSE_KEY = 'incluiai_sidebar_collapsed';
/** Dica animada de "recolher o menu" — exibida uma única vez. */
const SIDEBAR_HINT_KEY = 'incluiai_sidebar_collapse_hint_seen';

interface SidebarProps {
  user: User;
  currentView: string;
  setView: (view: any) => void;
  isOpen: boolean;
  onCloseMobile?: () => void;
  onLogout: () => void;
  studentCount: number;
  protocolCount: number;
  hasFinalCaseStudy?: boolean;
  planMaxStudents?: number;
  triagemCount?: number;
  unreadMessages?: number;
  creditsAvailable?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  user,
  currentView,
  setView,
  isOpen,
  onCloseMobile,
  onLogout,
  triagemCount = 0,
  unreadMessages = 0,
}) => {
  const isPremium = user.plan === PlanTier.PREMIUM;
  const isPro     = user.plan === PlanTier.PRO;
  const isPaid    = isPro || isPremium; // PRO ou PREMIUM — qualquer plano pago

  // Recolher/expandir é um recurso exclusivo de desktop (>=1024px), controlado
  // inteiramente dentro deste componente e persistido em localStorage.
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [isDesktop, setIsDesktop] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(min-width: 1024px)');
    const handler = () => setIsDesktop(mql.matches);
    handler();
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = () => setPrefersReducedMotion(mql.matches);
    handler();
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSE_KEY, isCollapsed ? '1' : '0');
    } catch {
      /* localStorage indisponível — preferência não persistida nesta sessão */
    }
  }, [isCollapsed]);

  // Estado efetivo usado para decidir o que é renderizado (ícone-only só conta no desktop).
  const collapsed = isCollapsed && isDesktop;

  // No mobile/tablet (abaixo do breakpoint), a sidebar é um drawer controlado por `isOpen`
  // (estado do App.tsx). No desktop ela NUNCA depende de `isOpen` — fica sempre visível,
  // apenas alternando entre expandida (288px) e recolhida (72px) via `isCollapsed`.
  const hiddenOffscreenMobile = !isDesktop && !isOpen;

  // Fecha o drawer apenas no mobile/tablet. No desktop, navegar entre views NUNCA
  // deve alterar o estado aberto/recolhido da sidebar (causa raiz do "sidebar some ao navegar").
  const closeDrawerIfMobile = () => {
    if (!isDesktop) onCloseMobile?.();
  };

  // ─── Dica animada "recolha o menu" (uma única vez, só desktop) ──────────────
  const [hintDismissed, setHintDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      return window.localStorage.getItem(SIDEBAR_HINT_KEY) === '1';
    } catch {
      return true;
    }
  });
  const [hintVisible, setHintVisible] = useState(false);

  const dismissHint = () => {
    setHintVisible(false);
    setHintDismissed(true);
    try {
      window.localStorage.setItem(SIDEBAR_HINT_KEY, '1');
    } catch {
      /* localStorage indisponível — dica pode reaparecer nesta sessão */
    }
  };

  useEffect(() => {
    if (!isDesktop || hintDismissed || isCollapsed) {
      setHintVisible(false);
      return;
    }
    const showTimer = window.setTimeout(() => setHintVisible(true), 900);
    return () => window.clearTimeout(showTimer);
  }, [isDesktop, hintDismissed, isCollapsed]);

  useEffect(() => {
    if (!hintVisible) return;
    const duration = prefersReducedMotion ? 2600 : 5200;
    const hideTimer = window.setTimeout(() => dismissHint(), duration);
    return () => window.clearTimeout(hideTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hintVisible, prefersReducedMotion]);

  const planLabel = useMemo(() => {
    const p = user.plan;
    if (p === PlanTier.FREE) return 'FREE';
    if (p === PlanTier.PRO) return 'PRO';
    if (p === PlanTier.PREMIUM) return 'PREMIUM';
    return String(p ?? '').split(' ')[0] || 'FREE';
  }, [user.plan]);

  const withTooltip = (node: React.ReactElement, label: string) => {
    if (!collapsed) return node;
    return (
      <Tooltip>
        <TooltipTrigger asChild>{node}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    );
  };

  const SectionLabel = ({ children, first }: { children: React.ReactNode; first?: boolean }) =>
    collapsed ? (
      <div className={cn('mx-3 mb-2 h-px', !first && 'mt-4')} style={{ background: '#0097A7', opacity: 0.2 }} />
    ) : (
      <div className={cn('px-3 mb-2 flex items-center gap-2', !first && 'pt-4')}>
        <span
          className="text-[9px] font-extrabold uppercase tracking-[0.12em] whitespace-nowrap"
          style={{ color: '#0097A7' }}
        >
          {children}
        </span>
        <div className="flex-1 h-px" style={{ background: '#0097A7', opacity: 0.2 }} />
      </div>
    );

  /** Item bloqueado — requer PREMIUM */
  const LockedNavItem = ({ icon: Icon, label }: { icon: any; label: string }) =>
    withTooltip(
      <button
        onClick={() => { setView('subscription'); closeDrawerIfMobile(); }}
        title={collapsed ? undefined : 'Disponível apenas no plano PREMIUM — clique para fazer upgrade'}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 opacity-50 cursor-pointer hover:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petrol/40',
          collapsed && 'justify-center px-0'
        )}
      >
        <Icon size={18} className="shrink-0 text-gray-400" />
        {!collapsed && (
          <>
            <span className="flex-1 text-left text-gray-400">{label}</span>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 shrink-0">
              PREMIUM
            </span>
          </>
        )}
      </button>,
      `${label} — disponível apenas no plano PREMIUM`
    );

  /** Item bloqueado para planos FREE — requer PRO ou PREMIUM */
  const LockedNavItemPro = ({ icon: Icon, label }: { icon: any; label: string }) =>
    withTooltip(
      <button
        onClick={() => { setView('subscription'); closeDrawerIfMobile(); }}
        title={collapsed ? undefined : 'Disponível a partir do plano PRO — clique para fazer upgrade'}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 opacity-50 cursor-pointer hover:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petrol/40',
          collapsed && 'justify-center px-0'
        )}
      >
        <Icon size={18} className="shrink-0 text-gray-400" />
        {!collapsed && (
          <>
            <span className="flex-1 text-left text-gray-400">{label}</span>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 shrink-0">
              PRO
            </span>
          </>
        )}
      </button>,
      `${label} — disponível a partir do plano PRO`
    );

  const NavItem = ({
    viewId,
    icon: Icon,
    label,
    badge,
    title,
    iconColor,
  }: {
    viewId: string;
    icon: any;
    label: string;
    badge?: string;
    title?: string;
    iconColor?: string;
  }) =>
    withTooltip(
      <button
        onClick={() => { setView(viewId); closeDrawerIfMobile(); }}
        title={collapsed ? undefined : title}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petrol/40',
          currentView === viewId
            ? 'bg-petrol text-white shadow-sm'
            : 'text-gray-500 hover:bg-petrol/10 hover:text-petrol',
          collapsed && 'justify-center px-0'
        )}
      >
        <span className="relative inline-flex shrink-0">
          <Icon
            size={18}
            style={{ color: currentView === viewId ? '#FFFFFF' : (iconColor ?? 'currentColor') }}
          />
          {collapsed && badge && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 border border-white" />
          )}
        </span>
        {!collapsed && (
          <>
            <span className="flex-1 text-left">{label}</span>
            {badge && (
              <span className={cn(
                'text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0',
                currentView === viewId
                  ? 'bg-white/20 text-white'
                  : 'bg-petrol/10 text-petrol'
              )}>
                {badge}
              </span>
            )}
          </>
        )}
      </button>,
      label
    );

  return (
    <TooltipProvider delayDuration={150}>
      <style>{`
        @keyframes incluiai-hint-nudge {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(-3px); }
        }
        .incluiai-hint-hand { animation: incluiai-hint-nudge 1.1s ease-in-out infinite; }
      `}</style>
      <aside
        className={cn(
          'bg-surface border-r border-border fixed lg:sticky lg:top-0 lg:h-screen inset-y-0 left-0 z-40 flex flex-col print:hidden transition-all duration-300 ease-in-out overflow-x-hidden',
          'w-[288px] max-w-[85vw] lg:max-w-none',
          isCollapsed ? 'lg:w-[72px]' : 'lg:w-[288px]',
          hiddenOffscreenMobile ? '-translate-x-full' : 'translate-x-0'
        )}
      >
        {/* Logo + recolher/expandir */}
        <div
          className={cn(
            'h-16 flex items-center border-b border-border shrink-0 gap-1',
            collapsed ? 'justify-center px-1' : 'justify-between px-4'
          )}
        >
          {collapsed ? (
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: BRAND.blue }}
              title="IncluiAI"
            >
              <Brain size={16} color="white" />
            </div>
          ) : (
            <BrandLogo fontSize={18} iconSize={16} />
          )}
          <div className="hidden lg:flex items-center gap-1 shrink-0">
            {hintVisible && !prefersReducedMotion && (
              <Hand size={14} className="incluiai-hint-hand shrink-0" style={{ color: '#C69214' }} aria-hidden="true" />
            )}
            <button
              onClick={() => { setIsCollapsed(v => !v); dismissHint(); }}
              title={isCollapsed ? 'Expandir menu' : 'Recolher menu'}
              aria-label={isCollapsed ? 'Expandir menu' : 'Recolher menu'}
              className="flex items-center justify-center w-7 h-7 rounded-md text-gray-400 hover:bg-petrol/10 hover:text-petrol transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petrol/40"
            >
              {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            </button>
          </div>
        </div>

        {/* Dica animada — "recolha o menu para ampliar sua área de trabalho" (uma única vez, só desktop) */}
        {hintVisible && (
          <div
            role="status"
            onClick={dismissHint}
            className="hidden lg:block absolute top-[68px] right-2 z-50 w-52 rounded-lg border border-border bg-surface shadow-lg p-3 text-xs leading-snug text-gray-600 cursor-pointer"
          >
            <span
              aria-hidden="true"
              className="absolute -top-1.5 right-4 w-3 h-3 bg-surface border-l border-t border-border rotate-45"
            />
            Recolha o menu para ampliar sua área de trabalho.
          </div>
        )}

        {/* Painel CEO (somente admin) */}
        {user.isAdmin && (
          <div
            className={cn('border-b border-border/30 shrink-0', collapsed ? 'px-2 py-3 flex justify-center' : 'px-4 py-4')}
            style={{ background: 'linear-gradient(135deg, #1F4E5F 0%, #2E3A59 100%)' }}
          >
            {collapsed ? (
              <div title="Painel CEO" style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981' }} />
            ) : (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: '#C69214', textTransform: 'uppercase' }}>
                    Painel CEO
                  </span>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
                </div>
                <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 500, whiteSpace: 'nowrap' }}>
                  Administração do Sistema
                </div>
              </>
            )}
          </div>
        )}

        {/* Navegação */}
        <div className="flex-1 py-4 px-3 overflow-y-auto overflow-x-hidden custom-scrollbar">
          {user.isAdmin && currentView === 'admin' ? (
            <nav className="space-y-1">
              <SectionLabel first>Gestão Executiva</SectionLabel>
              <NavItem viewId="admin" icon={PieChart} label="Visão Estratégica" iconColor="#C69214" />
            </nav>
          ) : (
            <nav className="space-y-1">
              {/* Geral */}
              <SectionLabel first>Geral</SectionLabel>
              <NavItem viewId="dashboard"    icon={Home}     label="Dashboard" iconColor="#164F5F" />
              <NavItem viewId="students"     icon={Users}    label="Cadastrar aluno" iconColor="#2563EB" />
              <NavItem viewId="appointments" icon={Calendar} label="Agenda" iconColor="#0D9488" />

              {/* Documentação pedagógica */}
              <SectionLabel>Documentação</SectionLabel>
              <NavItem viewId="estudo_caso"    icon={FileSearch}    label="Estudo de Caso" iconColor="#7C3AED" />
              <NavItem viewId="paee"           icon={ClipboardList} label="PAEE (uso exclusivo do AEE)"  title="Documento exclusivo para professores do Atendimento Educacional Especializado (AEE)" iconColor="#D97706" />
              <NavItem viewId="protocols"      icon={FileText}      label="PEI" iconColor="#16A34A" />
              <NavItem viewId="documento_unificado" icon={FileText} label="Plano Unificado PAEE + PEI" title="Documento formal integrado para articular PAEE, PEI, apoios e acessibilidade curricular" iconColor="#0F766E" />
              <NavItem viewId="pdi"            icon={GraduationCap} label="PDI (opcional)"               title="Documento opcional para planejamento individual complementar" iconColor="#DB2777" />
              {isPaid
                ? <NavItem viewId="school_templates" icon={LayoutTemplate} label="Meus Modelos" iconColor="#C69214" />
                : <LockedNavItemPro icon={LayoutTemplate} label="Meus Modelos" />
              }
              <NavItem viewId="printable_templates" icon={Printer} label="Modelos Imprimíveis" iconColor="#0D9488" />

              {/* Ferramentas IA */}
              <SectionLabel>Ferramentas IA</SectionLabel>
              {isPaid
                ? <NavItem viewId="incluilab" icon={FlaskConical} label="Laboratório de Adaptações" iconColor="#EA580C" />
                : <LockedNavItemPro icon={FlaskConical} label="Laboratório de Adaptações" />
              }
              {isPaid
                ? <NavItem viewId="incluilab_library" icon={FileText} label="Biblioteca IncluiLAB" iconColor="#0891B2" />
                : <LockedNavItemPro icon={FileText} label="Biblioteca IncluiLAB" />
              }

              {/* Avaliação & Histórico */}
              <SectionLabel>Avaliação e histórico</SectionLabel>
              {isPaid
                ? <NavItem viewId="reports" icon={Brain} label="Perfil Cognitivo" iconColor="#8B5CF6" />
                : <LockedNavItemPro icon={Brain} label="Perfil Cognitivo" />
              }
              {isPremium
                ? <NavItem viewId="service_control" icon={Activity} label="Controle de Atendimento" iconColor="#10B981" />
                : <LockedNavItem icon={Activity} label="Controle de Atendimento" />
              }
              <NavItem viewId="fichas_historicos" icon={History} label="Fichas e Históricos" iconColor="#C69214" />

              {/* Conta */}
              <SectionLabel>Conta</SectionLabel>
              <NavItem viewId="subscription" icon={CreditCard}     label="Assinatura & Créditos" iconColor="#1F4E5F" />
              <NavItem viewId="help_center"  icon={LifeBuoy}       label="Central de Ajuda" iconColor="#25D366" />
              <NavItem
                viewId="messages"
                icon={MessageSquare}
                label="Mensagens"
                badge={unreadMessages > 0 ? String(unreadMessages > 9 ? '9+' : unreadMessages) : undefined}
                iconColor="#2563EB"
              />
              {withTooltip(
                <a
                  href={waUrl('Olá! Vim pelo IncluiAI e gostaria de ajuda.')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 text-gray-500 hover:bg-petrol/10 hover:text-petrol no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petrol/40',
                    collapsed && 'justify-center px-0'
                  )}
                  style={{ textDecoration: 'none' }}
                >
                  <MessageCircle size={18} className="shrink-0" style={{ color: '#25D366' }} />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left">Suporte Humanizado</span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 shrink-0">
                        WA
                      </span>
                    </>
                  )}
                </a>,
                'Suporte Humanizado (WhatsApp)'
              )}
              {user.isAdmin && (
                <NavItem viewId="admin" icon={PieChart} label="Painel CEO" iconColor="#B45309" />
              )}
            </nav>
          )}
        </div>

        {/* Rodapé fixo — apenas Configurações e Sair da Conta */}
        <div className={cn('border-t border-border bg-bg-app shrink-0 space-y-1', collapsed ? 'p-2' : 'p-3')}>
          <NavItem viewId="settings" icon={Settings} label="Configurações" iconColor="#64748B" />
          {withTooltip(
            <button
              onClick={onLogout}
              className={cn(
                'w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold border transition-all duration-150',
                'bg-red-50 text-red-600 border-red-200 hover:bg-red-100 hover:border-red-300 hover:text-red-700',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50',
                collapsed && 'px-0'
              )}
            >
              <LogOut size={16} className="shrink-0" />
              {!collapsed && <span className="whitespace-nowrap">Sair da Conta</span>}
            </button>,
            'Sair da conta'
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
};
