/**
 * landingService.ts
 * Gerencia o conteúdo dinâmico da landing page (editado pelo CEO no painel admin).
 */

import { supabase } from './supabase';
import type { LandingSection } from '../types';

export const LandingService = {
  /** Retorna todas as seções */
  async getAll(): Promise<LandingSection[]> {
    const { data, error } = await supabase
      .from('landing_content')
      .select('*')
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
    updatedById?: string;
    updatedByName?: string;
  }): Promise<LandingSection> {
    const { data, error } = await supabase
      .from('landing_content')
      .upsert({
        section_key: params.sectionKey,
        title: params.title,
        subtitle: params.subtitle,
        content_json: params.contentJson ?? {},
        updated_by: params.updatedById,
        updated_by_name: params.updatedByName,
        updated_at: new Date().toISOString(),
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
    }>,
    updatedById?: string,
    updatedByName?: string
  ): Promise<void> {
    const now = new Date().toISOString();
    const rows = sections.map(s => ({
      section_key: s.sectionKey,
      title: s.title,
      subtitle: s.subtitle,
      content_json: s.contentJson ?? {},
      updated_by: updatedById,
      updated_by_name: updatedByName,
      updated_at: now,
    }));

    const { error } = await supabase
      .from('landing_content')
      .upsert(rows, { onConflict: 'section_key' });
    if (error) throw error;
  },
};

function mapSection(row: any): LandingSection {
  return {
    id: row.id,
    section_key: row.section_key,
    title: row.title,
    subtitle: row.subtitle,
    content_json: row.content_json ?? {},
    updated_by: row.updated_by,
    updated_by_name: row.updated_by_name,
    updated_at: row.updated_at,
  };
}
