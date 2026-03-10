import React, { useMemo } from 'react';
import {
  Users,
  FileText,
  Settings,
  LogOut,
  Brain,
  Zap,
  BarChart3,
  Home,
  PieChart,
  ClipboardList,
  GraduationCap,
  FileSearch,
  Stethoscope,
  Lock,
  ClipboardCheck,
  Crown,
  FlaskConical,
  Sparkles,
  CalendarDays,
} from 'lucide-react';

import { User, getPlanLimits, DocumentType, PlanTier } from '../types';

interface SidebarProps {
  user: User;
  currentView: string;
  setView: (view: any) => void;
  isOpen: boolean;
  onLogout: () => void;
  studentCount: number;
  protocolCount: number;
  hasFinalCaseStudy?: boolean;

  /** ✅ limite real de alunos vindo do banco (plans.max_students via summary) */
  planMaxStudents?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  user,
  currentView,
  setView,
  isOpen,
  onLogout,
  studentCount,
  protocolCount,
  hasFinalCaseStudy = false,
  planMaxStudents
}) => {
  // Mantemos getPlanLimits apenas para features (allowed_docs, attendance_control etc)
  const limits = getPlanLimits(user.plan);

  // ✅ Protege allowed_docs caso venha undefined
  const allowedDocs = Array.isArray((limits as any)?.allowed_docs) ? (limits as any).allowed_docs : [];

  // ✅ Fonte única para o contador: preferir planMaxStudents do banco, fallback no legado
  const maxStudents = Number.isFinite(planMaxStudents as number)
    ? (planMaxStudents as number)
    : ((limits as any)?.students ?? 0);

  const isMaster = user.plan === PlanTier.PREMIUM; // PREMIUM == MASTER

  const canSeeDoc = (docType: string) => {
    if (allowedDocs.includes('ALL')) return true;
    return allowedDocs.includes(docType);
  };

  const NavItem = ({
    viewId,
    icon: Icon,
    label,
    disabled = false,
    locked = false,
    badge,
    masterOnly = false
  }: {
    viewId: string;
    icon: any;
    label: string;
    disabled?: boolean;
    locked?: boolean;
    badge?: string;
    masterOnly?: boolean;
  }) => {
    const showCrown = masterOnly && !isMaster;

    return (
      <button
        onClick={() => !disabled && !locked && !showCrown && setView(viewId)}
        disabled={disabled || locked || showCrown}
        title={
          locked
            ? 'Finalize o Estudo de Caso primeiro para habilitar'
            : showCrown
            ? 'Recurso exclusivo do plano MASTER'
            : undefined
        }
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition ${
          currentView === viewId
            ? 'bg-brand-50 text-brand-700'
            : locked || showCrown
            ? 'text-gray-300 cursor-not-allowed'
            : disabled
            ? 'hidden'
            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
        }`}
      >
        <Icon size={20} className="shrink-0" />
        <span className="whitespace-nowrap flex-1 text-left">{label}</span>

        {locked && <Lock size={12} className="text-gray-300 shrink-0" />}

        {showCrown && (
          <span className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-100">
            <Crown size={10} className="shrink-0" /> MASTER
          </span>
        )}

        {badge && !locked && !showCrown && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-brand-100 text-brand-700">
            {badge}
          </span>
        )}
      </button>
    );
  };

  // ✅ evita exibir "Starter" (porque o split(' ') pega "Starter")
  const planLabel = useMemo(() => {
    const p = user.plan;
    if (p === PlanTier.FREE) return 'FREE';
    if (p === PlanTier.PRO) return 'PRO';
    if (p === PlanTier.PREMIUM) return 'MASTER';
    if (p === PlanTier.INSTITUTIONAL) return 'INSTITUCIONAL';
    return String(p ?? '').split(' ')[0] || 'FREE';
  }, [user.plan]);

  const safeMax = typeof maxStudents === 'number' && maxStudents > 0 ? maxStudents : 0;
  const usagePct = safeMax > 0 ? Math.min(100, (studentCount / safeMax) * 100) : 0;

  return (
    <aside
      className={`bg-white border-r border-gray-200 fixed lg:static inset-y-0 left-0 z-40 transition-all duration-300 flex flex-col print:hidden ${
        isOpen
          ? 'translate-x-0 w-64'
          : '-translate-x-full lg:translate-x-0 w-64 lg:w-0 lg:overflow-hidden lg:border-none'
      }`}
    >
      <div className="h-16 flex items-center px-6 border-b border-gray-50 bg-white shrink-0">
        <div className="bg-brand-600 p-1 rounded-md mr-3 shrink-0">
          <Brain className="text-white h-5 w-5" />
        </div>
        <span className="text-xl font-bold text-gray-800 tracking-tight whitespace-nowrap">IncluiAI</span>
      </div>

      <div className="px-4 py-4 bg-gray-50 border-b border-gray-100 shrink-0">
        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 whitespace-nowrap">
          Plano: {planLabel}
        </div>

        <div className="flex items-center justify-between text-[10px] font-bold text-gray-600 mb-1">
          <span>Alunos</span>
          <span>
            {studentCount} / {safeMax}
          </span>
        </div>

        <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden mb-3">
          <div className="h-full bg-brand-500" style={{ width: `${usagePct}%` }} />
        </div>
      </div>

      <div className="flex-1 py-4 px-4 overflow-y-auto custom-scrollbar">
        {user.isAdmin ? (
          <nav className="space-y-1">
            <div className="px-3 mb-2 text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">
              Gestão Executiva
            </div>
            <NavItem viewId="admin" icon={PieChart} label="Visão Estratégica" />
          </nav>
        ) : (
          <nav className="space-y-1">
            <div className="px-3 mb-2 text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">
              Geral
            </div>
            <NavItem viewId="dashboard" icon={Home} label="Início" />
            <NavItem viewId="students" icon={Users} label="Meus Alunos" />
            <NavItem viewId="agenda" icon={CalendarDays} label="Agenda" />

            {/* MASTER ONLY */}
            <NavItem
              viewId="service_control"
              icon={Stethoscope}
              label="Controle Atendimentos"
              masterOnly={!Boolean((limits as any)?.attendance_control)}
            />

            <div className="pt-4 px-3 mb-2 text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">
              Documentação
            </div>

            {canSeeDoc(DocumentType.ESTUDO_CASO) && (
              <NavItem viewId="estudo_caso" icon={FileSearch} label="Estudo de Caso" badge="Início" />
            )}

            {canSeeDoc(DocumentType.PAEE) && (
              <NavItem viewId="paee" icon={ClipboardList} label="PAEE (Atendimento)" />
            )}

            {canSeeDoc(DocumentType.PEI) && (
              <NavItem viewId="protocols" icon={FileText} label="PEI (Plano Individual)" />
            )}

            {canSeeDoc(DocumentType.PDI) && (
              <NavItem viewId="pdi" icon={GraduationCap} label="PDI (Desenvolvimento)" />
            )}

            <NavItem viewId="fichas_complementares" icon={ClipboardCheck} label="Fichas de Observação" />

            <div className="pt-4 px-3 mb-2 text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">
              Pedagógico
            </div>

            {/* IncluiLAB hub + subitens */}
            <NavItem viewId="incluiLab" icon={FlaskConical} label="IncluiLAB" badge="NOVO" />
            <div className="ml-3 pl-3 border-l-2 border-brand-100 space-y-0.5">
              <NavItem viewId="ativaIA"    icon={Zap}      label="AtivaIA" />
              <NavItem viewId="eduLensIA"  icon={Brain}    label="EduLensIA" />
              <NavItem viewId="neuroDesign" icon={Sparkles} label="NeuroDesign" />
            </div>

            {/* PRO+ (charts true no PRO e no MASTER) */}
            {Boolean((limits as any)?.charts) && <NavItem viewId="relatorios" icon={BarChart3} label="Relatório Evolutivo" />}

            <div className="pt-4 border-t border-gray-100 mt-4">
              <NavItem viewId="settings" icon={Settings} label="Configurações" />
            </div>
          </nav>
        )}
      </div>

      <div className="p-4 border-t border-gray-100 bg-gray-50 shrink-0">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-xs shrink-0 overflow-hidden">
            {(user as any).profilePhoto ? (
              <img src={(user as any).profilePhoto} alt="foto" className="w-full h-full object-cover" />
            ) : (
              (user.name || 'U').substring(0, 2).toUpperCase()
            )}
          </div>
          <div className="overflow-hidden">
            <p className="text-sm font-bold text-gray-900 truncate">{user.name || 'Usuário'}</p>
            <p className="text-xs text-gray-500 truncate">
              {user.tenantType === 'SCHOOL' ? 'Escola' : user.tenantType === 'CLINIC' ? 'Clínica' : 'Profissional'}
            </p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium transition"
        >
          <LogOut size={16} /> <span className="whitespace-nowrap">Sair da Conta</span>
        </button>
      </div>
    </aside>
  );
};