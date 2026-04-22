/**
 * userTemplateService.ts
 * CRUD para user_document_templates + conversão template → documento.
 *
 * SEPARAÇÃO EXPLÍCITA (Ajuste 2):
 *   templateToDocumentData() é o único ponto de conversão.
 *   Retorna uma cópia profunda: editar o documento resultante
 *   NUNCA afeta o template original.
 */

import { supabase } from './supabase';
import {
  UserDocumentTemplate,
  UserDocTemplateType,
  TemplateData,
  TemplateSectionDef,
  DocumentData,
  DocSection,
  DocField,
} from '../types';
import { getSystemTemplate } from '../data/systemTemplates';

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

async function getTenantAndUser(): Promise<{ tenantId: string; userId: string }> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Usuário não autenticado.');

  const { data, error } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.id)
    .single();
  if (error || !data?.tenant_id) throw new Error('Tenant não encontrado.');

  return { tenantId: data.tenant_id as string, userId: user.id };
}

function rowToTemplate(row: Record<string, any>): UserDocumentTemplate {
  return {
    id:              row.id,
    tenantId:        row.tenant_id,
    createdBy:       row.created_by,
    name:            row.name,
    description:     row.description ?? undefined,
    documentType:    row.document_type as UserDocTemplateType,
    source:          row.source as 'system' | 'user',
    baseTemplateId:  row.base_template_id ?? undefined,
    templateData:    row.template_data as TemplateData,
    version:         row.version,
    isDefault:       row.is_default,
    isActive:        row.is_active,
    timesUsed:       row.times_used,
    createdAt:       row.created_at,
    updatedAt:       row.updated_at,
  };
}

function templateToRow(
  t: Partial<UserDocumentTemplate>,
  tenantId: string,
  userId: string,
): Record<string, any> {
  return {
    tenant_id:        tenantId,
    created_by:       userId,
    name:             t.name,
    description:      t.description ?? null,
    document_type:    t.documentType,
    source:           t.source ?? 'user',
    base_template_id: t.baseTemplateId ?? null,
    template_data:    t.templateData,
    version:          t.version ?? 1,
    is_default:       t.isDefault ?? false,
    is_active:        t.isActive ?? true,
  };
}

// ---------------------------------------------------------------------------
// UserTemplateService — API pública
// ---------------------------------------------------------------------------

export const UserTemplateService = {

  /**
   * Lista todos os templates ativos do tenant, opcionalmente filtrados por tipo.
   */
  async list(docType?: UserDocTemplateType): Promise<UserDocumentTemplate[]> {
    const { tenantId } = await getTenantAndUser();

    let query = supabase
      .from('user_document_templates')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (docType) query = query.eq('document_type', docType);

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(rowToTemplate);
  },

  /**
   * Busca um template pelo ID.
   */
  async get(id: string): Promise<UserDocumentTemplate | null> {
    const { data, error } = await supabase
      .from('user_document_templates')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return null;
    return rowToTemplate(data);
  },

  /**
   * Retorna o template padrão do usuário para o tipo informado.
   * Retorna null se o usuário não tiver um padrão definido.
   */
  async getDefault(docType: UserDocTemplateType): Promise<UserDocumentTemplate | null> {
    const { tenantId } = await getTenantAndUser();
    const { data, error } = await supabase
      .from('user_document_templates')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('document_type', docType)
      .eq('is_default', true)
      .eq('is_active', true)
      .single();
    if (error || !data) return null;
    return rowToTemplate(data);
  },

  /**
   * Salva um novo template do usuário.
   */
  async save(
    data: Pick<UserDocumentTemplate, 'name' | 'documentType' | 'templateData' | 'source'> &
          Partial<Pick<UserDocumentTemplate, 'description' | 'isDefault' | 'baseTemplateId'>>,
  ): Promise<UserDocumentTemplate> {
    const { tenantId, userId } = await getTenantAndUser();

    // Se vai ser padrão, desativa o anterior
    if (data.isDefault) {
      await this._clearDefault(tenantId, data.documentType);
    }

    const row = templateToRow(data, tenantId, userId);
    const { data: inserted, error } = await supabase
      .from('user_document_templates')
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    return rowToTemplate(inserted);
  },

  /**
   * Atualiza nome, descrição ou templateData de um template existente.
   */
  async update(
    id: string,
    patch: Partial<Pick<UserDocumentTemplate, 'name' | 'description' | 'templateData'>>,
  ): Promise<UserDocumentTemplate> {
    const updates: Record<string, any> = {};
    if (patch.name        !== undefined) updates.name          = patch.name;
    if (patch.description !== undefined) updates.description   = patch.description;
    if (patch.templateData !== undefined) {
      updates.template_data = patch.templateData;
      // Incrementa versão a cada edição de estrutura
      const { data: current } = await supabase
        .from('user_document_templates')
        .select('version')
        .eq('id', id)
        .single();
      updates.version = (current?.version ?? 1) + 1;
    }

    const { data, error } = await supabase
      .from('user_document_templates')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return rowToTemplate(data);
  },

  /**
   * Define um template como padrão para o tipo, removendo o padrão anterior.
   * Regra: apenas 1 padrão ativo por tipo por tenant (enforçado também no DB).
   */
  async setDefault(id: string, docType: UserDocTemplateType): Promise<void> {
    const { tenantId } = await getTenantAndUser();
    await this._clearDefault(tenantId, docType);
    const { error } = await supabase
      .from('user_document_templates')
      .update({ is_default: true })
      .eq('id', id);
    if (error) throw error;
  },

  /**
   * Soft-delete: mantém o registro para preservar histórico de documentos gerados.
   */
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('user_document_templates')
      .update({ is_active: false, is_default: false })
      .eq('id', id);
    if (error) throw error;
  },

  /**
   * Duplica um template existente (ou o template padrão do sistema).
   * Retorna o novo template com is_default=false e nome "Cópia de [nome]".
   */
  async duplicate(
    sourceId: string,
    overrides?: { name?: string; isDefault?: boolean },
  ): Promise<UserDocumentTemplate> {
    let source: UserDocumentTemplate | null;

    if (sourceId.startsWith('system_')) {
      const docType = sourceId.replace('system_', '') as UserDocTemplateType;
      source = getSystemTemplate(docType);
    } else {
      source = await this.get(sourceId);
    }

    if (!source) throw new Error('Template não encontrado para duplicar.');

    return this.save({
      name:           overrides?.name ?? `Cópia de ${source.name}`,
      documentType:   source.documentType,
      source:         'user',
      description:    source.description,
      templateData:   JSON.parse(JSON.stringify(source.templateData)), // deep copy
      isDefault:      overrides?.isDefault ?? false,
      baseTemplateId: source.source === 'user' ? source.id : undefined,
    });
  },

  /**
   * Incrementa o contador de uso (fire-and-forget — não lança erro).
   */
  async incrementUsage(id: string): Promise<void> {
    if (id.startsWith('system_')) return; // templates do sistema não têm contador no DB
    await supabase.rpc('increment_udt_usage', { template_id: id }).then(() => {});
    // Fallback manual caso a RPC não exista ainda:
    // await supabase.from('user_document_templates')
    //   .update({ times_used: supabase.raw('times_used + 1') })
    //   .eq('id', id);
  },

  // ---------------------------------------------------------------------------
  // PONTO EXPLÍCITO DE CONVERSÃO (Ajuste 2)
  //
  // templateToDocumentData() é a ÚNICA porta de entrada entre template e documento.
  //
  // Contrato:
  //   - Entrada: UserDocumentTemplate ou TemplateData (imutável)
  //   - Saída:   DocumentData (cópia profunda independente)
  //
  // Editar o DocumentData retornado NUNCA afeta o template original.
  // Nenhum dado de aluno é inserido aqui — isso é responsabilidade do caller.
  // ---------------------------------------------------------------------------
  templateToDocumentData(source: UserDocumentTemplate | TemplateData): DocumentData {
    const templateData: TemplateData =
      'sections' in source && 'metadata' in source
        ? (source as TemplateData)
        : (source as UserDocumentTemplate).templateData;

    const sections: DocSection[] = [...templateData.sections]
      .sort((a, b) => a.order - b.order)
      .map((sec: TemplateSectionDef): DocSection => ({
        id:     sec.id,
        title:  sec.title,
        fields: [...sec.fields]
          .sort((a, b) => a.order - b.order)
          .map((f): DocField => ({
            id:          f.id,
            label:       f.label,
            type:        f.type,
            // value = defaultValue do template ou string vazia — NUNCA dado de aluno
            value:       f.type === 'checklist' ? [] : (f.defaultValue ?? ''),
            placeholder: f.placeholder,
            description: f.description,
            required:    f.required,
            options:     f.options ? [...f.options] : undefined,
            columns:     f.columns ? [...f.columns] : undefined,
            minScale:    f.minScale,
            maxScale:    f.maxScale,
            allowAudio:  f.allowAudio,
            isCustom:    false,
          })),
      }));

    // Retorna cópia profunda — completamente desconectada do template
    return { sections: JSON.parse(JSON.stringify(sections)) };
  },

  // ---------------------------------------------------------------------------
  // Helpers privados
  // ---------------------------------------------------------------------------
  async _clearDefault(tenantId: string, docType: UserDocTemplateType): Promise<void> {
    await supabase
      .from('user_document_templates')
      .update({ is_default: false })
      .eq('tenant_id', tenantId)
      .eq('document_type', docType)
      .eq('is_default', true);
  },
};
