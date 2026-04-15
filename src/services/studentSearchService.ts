/**
 * studentSearchService.ts
 * Busca de aluno por código único entre escolas, importação como aluno externo,
 * protocolos de acesso e notificações.
 *
 * Depende de: supabase/schema_v22_cross_school.sql (funções RPC e tabelas)
 */
import { supabase } from './supabase';
import type { User } from '../types';

// ─── Tipos de busca ───────────────────────────────────────────────────────────

export interface StudentSearchResult {
  student_id: string;
  student_name: string;
  school_name: string;
  grade: string;
  tenant_id: string;
  unique_code: string;
}

export interface ImportResult {
  student_id: string;
  protocol_code: string | null;
  already_exists: boolean;
  student_name: string;
}

export interface AccessProtocol {
  id: string;
  protocol_code: string;
  student_id: string;
  requesting_user_name: string;
  requesting_school: string;
  origin_school_name: string;
  access_type: 'import' | 'view' | 'collaborate';
  created_at: string;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, string>;
  read: boolean;
  created_at: string;
}

// ─── Serviço ──────────────────────────────────────────────────────────────────

export const StudentSearchService = {

  /**
   * Busca um aluno pelo código único (INC-XXXX-XXXX) em todos os tenants.
   * Retorna apenas dados públicos: nome, escola, série, tenant.
   * Não expõe dados clínicos (usa RPC SECURITY DEFINER no banco).
   */
  async searchByCode(code: string): Promise<StudentSearchResult | null> {
    const normalized = code.trim().toUpperCase();
    if (!normalized || normalized.length < 4) return null;

    const { data, error } = await supabase.rpc('search_student_by_code', {
      p_code: normalized,
    });

    if (error) {
      console.error('[StudentSearchService] searchByCode error:', error.message);
      return null;
    }

    if (!data || (Array.isArray(data) && data.length === 0)) return null;
    const row = Array.isArray(data) ? data[0] : data;
    return row as StudentSearchResult;
  },

  /**
   * Importa um aluno de outra escola para a base do professor atual.
   * Cria entrada como aluno externo (is_external = true), gera protocolo
   * PROT-XXXXXX e dispara notificações para ambas as partes.
   */
  async importStudent(
    sourceStudentId: string,
    user: User,
  ): Promise<ImportResult> {
    const schoolName = user.schoolConfigs?.[0]?.schoolName ?? 'Escola não informada';

    const { data, error } = await supabase.rpc('import_external_student', {
      p_source_student_id:    sourceStudentId,
      p_requesting_user_id:   user.id,
      p_requesting_user_name: user.name,
      p_requesting_tenant_id: user.tenant_id,
      p_requesting_school:    schoolName,
    });

    if (error) throw new Error(error.message);
    return data as ImportResult;
  },

  /**
   * Retorna protocolos de acesso criados pelo usuário atual
   * e protocolos onde o usuário é da escola de origem.
   */
  async getMyProtocols(): Promise<AccessProtocol[]> {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return [];

    const { data, error } = await supabase
      .from('student_access_protocols')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[StudentSearchService] getMyProtocols error:', error.message);
      return [];
    }
    return (data ?? []) as AccessProtocol[];
  },

  // ── Notificações ────────────────────────────────────────────────────────────

  /**
   * Retorna notificações do usuário autenticado (máx 50 recentes).
   */
  async getNotifications(): Promise<AppNotification[]> {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return [];

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[StudentSearchService] getNotifications error:', error.message);
      return [];
    }
    return (data ?? []) as AppNotification[];
  },

  /**
   * Conta notificações não lidas do usuário.
   */
  async getUnreadCount(): Promise<number> {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return 0;

    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('read', false);

    if (error) return 0;
    return count ?? 0;
  },

  /**
   * Marca uma ou todas as notificações como lidas.
   */
  async markRead(id?: string): Promise<void> {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return;

    const query = supabase.from('notifications').update({ read: true });
    if (id) {
      await query.eq('id', id);
    } else {
      await query.eq('read', false);
    }
  },
};
