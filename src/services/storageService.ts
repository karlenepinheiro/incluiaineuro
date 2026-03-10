import { supabase } from './supabase';

export const StorageService = {
  async uploadFile(
    file: File,
    bucket: 'laudos' | 'documentos_pdf' | 'imagens_atividades',
    path: string
  ): Promise<string | null> {
    try {
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(path, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) throw error;

      // supabase-js v2 retorna { path }
      return data?.path ?? null;
    } catch (err) {
      console.error('[StorageService.uploadFile] erro:', err);
      return null;
    }
  },

  async getPublicUrl(
    bucket: 'laudos' | 'documentos_pdf' | 'imagens_atividades',
    path: string
  ): Promise<string | null> {
    try {
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      return data?.publicUrl ?? null;
    } catch (err) {
      console.error('[StorageService.getPublicUrl] erro:', err);
      return null;
    }
  },

  async removeFile(
    bucket: 'laudos' | 'documentos_pdf' | 'imagens_atividades',
    path: string
  ): Promise<boolean> {
    try {
      const { error } = await supabase.storage.from(bucket).remove([path]);
      if (error) throw error;
      return true;
    } catch (err) {
      console.error('[StorageService.removeFile] erro:', err);
      return false;
    }
  },
};