/**
 * careRoutineService.ts
 * CRUD para as tabelas student_custom_sections e student_custom_fields
 * usadas pela aba "Cuidadoras e Rotina" do dossiê do aluno.
 */
import { supabase } from './supabase';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type FieldType =
  | 'text'
  | 'checklist'
  | 'scale'
  | 'suggestions'
  | 'rubric'
  | 'audio'
  | 'ai_prompt';

export interface CareField {
  id?: string;
  section_id?: string;
  label: string;
  field_type: FieldType;
  value: any;
  options?: any;
  is_required: boolean;
  enable_audio: boolean;
  order_index: number;
}

export interface CareSection {
  id?: string;
  title: string;
  category: string;
  order_index: number;
  fields: CareField[];
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const CareRoutineService = {
  /**
   * Carrega todas as seções (com campos aninhados) do aluno para categoria care_routine.
   */
  async load(studentId: string): Promise<CareSection[]> {
    try {
      const { data: sections, error: secErr } = await supabase
        .from('student_custom_sections')
        .select('*')
        .eq('student_id', studentId)
        .eq('category', 'care_routine')
        .order('order_index', { ascending: true });

      if (secErr) throw secErr;
      if (!sections?.length) return [];

      const sectionIds = sections.map((s: any) => s.id);

      const { data: fields, error: fldErr } = await supabase
        .from('student_custom_fields')
        .select('*')
        .in('section_id', sectionIds)
        .order('order_index', { ascending: true });

      if (fldErr) throw fldErr;

      return sections.map((s: any) => ({
        id:          s.id,
        title:       s.title,
        category:    s.category,
        order_index: s.order_index,
        fields: (fields ?? [])
          .filter((f: any) => f.section_id === s.id)
          .map((f: any): CareField => ({
            id:           f.id,
            section_id:   f.section_id,
            label:        f.label,
            field_type:   f.field_type as FieldType,
            value:        f.value,
            options:      f.options,
            is_required:  f.is_required ?? false,
            enable_audio: f.enable_audio ?? false,
            order_index:  f.order_index,
          })),
      }));
    } catch (e) {
      console.error('[CareRoutineService.load]', e);
      return [];
    }
  },

  /**
   * Persiste o estado completo: deleta removidos, upserta seções e campos.
   * Mutates sections in-place para atualizar os ids recém-criados.
   */
  async saveAll(params: {
    studentId:          string;
    tenantId:           string;
    userId:             string;
    sections:           CareSection[];
    deletedSectionIds:  string[];
    deletedFieldIds:    string[];
  }): Promise<void> {
    const { studentId, tenantId, userId, sections, deletedSectionIds, deletedFieldIds } = params;
    const now = new Date().toISOString();

    // 1. Deletar seções removidas (CASCADE elimina seus campos)
    if (deletedSectionIds.length > 0) {
      const { error } = await supabase
        .from('student_custom_sections')
        .delete()
        .in('id', deletedSectionIds);
      if (error) console.error('[CareRoutineService] delete sections:', error);
    }

    // 2. Deletar campos removidos individualmente
    if (deletedFieldIds.length > 0) {
      const { error } = await supabase
        .from('student_custom_fields')
        .delete()
        .in('id', deletedFieldIds);
      if (error) console.error('[CareRoutineService] delete fields:', error);
    }

    // 3. Upsert seções e campos
    for (let i = 0; i < sections.length; i++) {
      const sec = sections[i];

      const secBase = {
        tenant_id:   tenantId,
        student_id:  studentId,
        title:       sec.title,
        category:    sec.category,
        order_index: i,
        updated_by:  userId,
        updated_at:  now,
      };

      let sectionId = sec.id;

      if (sectionId) {
        const { error } = await supabase
          .from('student_custom_sections')
          .update(secBase)
          .eq('id', sectionId);
        if (error) console.error('[CareRoutineService] update section:', error);
      } else {
        const { data, error } = await supabase
          .from('student_custom_sections')
          .insert({ ...secBase, created_by: userId, created_at: now })
          .select('id')
          .single();
        if (error) { console.error('[CareRoutineService] insert section:', error); continue; }
        sectionId = data?.id;
        sections[i] = { ...sec, id: sectionId };
      }

      if (!sectionId) continue;

      // Upsert campos da seção
      for (let j = 0; j < sec.fields.length; j++) {
        const fld = sec.fields[j];

        const fldBase = {
          tenant_id:    tenantId,
          student_id:   studentId,
          section_id:   sectionId,
          label:        fld.label,
          field_type:   fld.field_type,
          value:        fld.value ?? null,
          options:      fld.options ?? null,
          is_required:  fld.is_required,
          enable_audio: fld.enable_audio,
          order_index:  j,
          updated_by:   userId,
          updated_at:   now,
        };

        if (fld.id) {
          const { error } = await supabase
            .from('student_custom_fields')
            .update(fldBase)
            .eq('id', fld.id);
          if (error) console.error('[CareRoutineService] update field:', error);
        } else {
          const { data, error } = await supabase
            .from('student_custom_fields')
            .insert({ ...fldBase, created_by: userId, created_at: now })
            .select('id')
            .single();
          if (error) { console.error('[CareRoutineService] insert field:', error); continue; }
          sections[i].fields[j] = { ...fld, id: data?.id, section_id: sectionId };
        }
      }
    }
  },
};
