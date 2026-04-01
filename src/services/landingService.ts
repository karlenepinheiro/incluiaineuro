/**
 * landingService.ts
 * Gerencia o conteúdo dinâmico da landing page (editado pelo CEO no painel admin).
 */

import { supabase } from './supabase';
import type { LandingSection } from '../types';

export const LandingService = {
  /** Retorna todas as seções (ativas ou não — para o editor CEO) */
  async getAll(): Promise<LandingSection[]> {
    const { data, error } = await supabase
      .from('landing_content')
      .select('*')
      .order('section_key', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapSection);
  },

  /** Retorna apenas seções ativas (para a landing page pública) */
  async getActive(): Promise<LandingSection[]> {
    const { data, error } = await supabase
      .from('landing_content')
      .select('*')
      .eq('is_active', true)
      .order('section_key', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapSection);
  },

  /** Retorna uma seção pelo key */
  async getByKey(sectionKey: string): Promise<LandingSection | null> {
    const { data, error } = await supabase
      .from('landing_content')
      .select('*')
      .eq('section_key', sectionKey)
      .maybeSingle();
    if (error) throw error;
    return data ? mapSection(data) : null;
  },

  /** Atualiza ou cria uma seção */
  async upsert(params: {
    sectionKey: string;
    title?: string;
    subtitle?: string;
    contentJson?: Record<string, any>;
    isActive?: boolean;
    updatedById?: string;
    updatedByName?: string;
  }): Promise<LandingSection> {
    const { data, error } = await supabase
      .from('landing_content')
      .upsert({
        section_key:      params.sectionKey,
        title:            params.title,
        subtitle:         params.subtitle,
        content_json:     params.contentJson ?? {},
        is_active:        params.isActive ?? true,
        updated_by:       params.updatedById,
        updated_by_name:  params.updatedByName,
        updated_at:       new Date().toISOString(),
      }, { onConflict: 'section_key' })
      .select()
      .single();
    if (error) throw error;
    return mapSection(data);
  },

  /** Salva múltiplas seções de uma vez */
  async saveAll(
    sections: Array<{
      sectionKey: string;
      title?: string;
      subtitle?: string;
      contentJson?: Record<string, any>;
      isActive?: boolean;
    }>,
    updatedById?: string,
    updatedByName?: string
  ): Promise<void> {
    const now = new Date().toISOString();
    const rows = sections.map(s => ({
      section_key:      s.sectionKey,
      title:            s.title,
      subtitle:         s.subtitle,
      content_json:     s.contentJson ?? {},
      is_active:        s.isActive ?? true,
      updated_by:       updatedById,
      updated_by_name:  updatedByName,
      updated_at:       now,
    }));

    const { error } = await supabase
      .from('landing_content')
      .upsert(rows, { onConflict: 'section_key' });
    if (error) throw error;
  },

  /** Ativa/desativa uma seção sem editar o conteúdo */
  async setActive(sectionKey: string, isActive: boolean): Promise<void> {
    const { error } = await supabase
      .from('landing_content')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('section_key', sectionKey);
    if (error) throw error;
  },
};

function mapSection(row: any): LandingSection {
  return {
    id:               row.id,
    section_key:      row.section_key,
    title:            row.title,
    subtitle:         row.subtitle,
    content_json:     row.content_json ?? {},
    is_active:        row.is_active ?? true,
    updated_by:       row.updated_by,
    updated_by_name:  row.updated_by_name,
    updated_at:       row.updated_at,
  };
}