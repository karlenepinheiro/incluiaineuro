import { supabase } from './supabase';

export interface PedagocicalDocument {
  id: string;
  student_id: string;
  tenant_id?: string;
  created_by?: string;
  /** Alias de doc_type (coluna real no banco). Mapeado em listByStudent. */
  type: string;
  doc_type: string;
  title?: string;
  status: string;
  structured_data: any;
  audit_code?: string;
  created_at: string;
  updated_at?: string;
}

export interface SaveDocumentInput {
  student_id: string;
  tenant_id: string;
  created_by: string;
  doc_type: string;
  title?: string;
  structured_data: any;
  status?: string;
  audit_code?: string;
}

export const DocumentService = {
  async saveDocument(input: SaveDocumentInput): Promise<PedagocicalDocument> {
    const { data, error } = await supabase
      .from('documents')
      .insert({
        student_id:      input.student_id,
        tenant_id:       input.tenant_id,
        created_by:      input.created_by,
        doc_type:        input.doc_type,
        title:           input.title ?? input.doc_type,
        status:          input.status ?? 'APPROVED',
        structured_data: input.structured_data,
        audit_code:      input.audit_code ?? null,
      })
      .select('id, student_id, tenant_id, doc_type, title, status, structured_data, audit_code, created_at')
      .single();

    if (error) throw error;
    return { ...data, type: data.doc_type };
  },

  async listByStudent(studentId: string): Promise<PedagocicalDocument[]> {
    const { data, error } = await supabase
      .from('documents')
      .select('id, student_id, tenant_id, created_by, doc_type, title, status, structured_data, audit_code, created_at, updated_at')
      .eq('student_id', studentId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;
    // Mapeia doc_type → type para compatibilidade com o restante do frontend
    return (data || []).map((row: any) => ({ ...row, type: row.doc_type }));
  },

  async updateDocument(id: string, structuredData: any, status: string = 'APPROVED'): Promise<PedagocicalDocument> {
    const { data, error } = await supabase
      .from('documents')
      .update({ 
        structured_data: structuredData, 
        status,
        updated_at: new Date().toISOString() 
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteDocument(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('documents')
      .update({ deleted_at: new Date().toISOString() }) // Soft Delete LGPD
      .eq('id', id);
      
    if (error) throw error;
    return true;
  }
};
