import { supabase, DEMO_MODE } from './supabase';

// ─── Cache simples em memória para signed URLs ────────────────────────────────
// Chave: filePath  →  { url, expiresAt (ms) }
const _signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const SIGNED_URL_TTL_SECONDS = 55 * 60; // 55 min (bucket usa 60 min)

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

  async getSignedUrl(
    bucket: 'laudos' | 'documentos_pdf' | 'imagens_atividades',
    path: string,
    expiresInSeconds = SIGNED_URL_TTL_SECONDS
  ): Promise<string | null> {
    const cacheKey = `${bucket}::${path}`;
    const cached = _signedUrlCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.url;
    }
    try {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, expiresInSeconds);
      if (error || !data?.signedUrl) {
        console.error('[StorageService.getSignedUrl] erro:', error);
        return null;
      }
      _signedUrlCache.set(cacheKey, {
        url: data.signedUrl,
        expiresAt: Date.now() + (expiresInSeconds - 60) * 1000, // invalida 1 min antes
      });
      return data.signedUrl;
    } catch (err) {
      console.error('[StorageService.getSignedUrl] erro:', err);
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

/**
 * Faz upload de uma imagem (base64 data URI ou URL HTTP) para o bucket
 * `imagens_atividades` e devolve a public URL final.
 * Retorna null se o upload falhar — o chamador decide o fallback.
 */
export async function persistImageToStorage(
  urlOrBase64: string,
  tenantId: string
): Promise<string | null> {
  if (!urlOrBase64) return null;
  try {
    let blob: Blob;
    if (urlOrBase64.startsWith('data:')) {
      const [header, data] = urlOrBase64.split(',');
      const mime = header.match(/data:([^;]+)/)?.[1] ?? 'image/png';
      const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
      blob = new Blob([bytes], { type: mime });
    } else {
      const resp = await fetch(urlOrBase64);
      if (!resp.ok) return null;
      blob = await resp.blob();
    }
    const ext = blob.type.includes('png') ? 'png' : 'jpg';
    const path = `${tenantId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from('imagens_atividades')
      .upload(path, blob, { cacheControl: '31536000', upsert: false });
    if (error) {
      console.error('[persistImageToStorage] upload error:', error.message);
      return null;
    }
    const { data } = supabase.storage.from('imagens_atividades').getPublicUrl(path);
    return data?.publicUrl ?? null;
  } catch (err) {
    console.error('[persistImageToStorage] unexpected error:', err);
    return null;
  }
}

/**
 * Utilitário global: recebe uma file_url armazenada no banco
 * (que pode ser uma URL pública antiga ou qualquer string)
 * e retorna uma signed URL válida se o arquivo estiver em
 * "imagens_atividades". Para outras URLs (DALL-E, base64, etc.)
 * devolve a URL original sem modificação.
 *
 * Inclui cache em memória para evitar chamadas repetidas.
 */
export async function getSignedImageUrl(fileUrl: string | null | undefined): Promise<string | null> {
  if (!fileUrl) return null;
  if (DEMO_MODE) return fileUrl;

  // Só processa URLs do bucket imagens_atividades
  const marker = '/imagens_atividades/';
  const markerIdx = fileUrl.indexOf(marker);
  if (markerIdx === -1) return fileUrl; // URL externa (DALL-E, base64, etc.)

  const filePath = fileUrl.slice(markerIdx + marker.length);
  if (!filePath) return fileUrl;

  const signed = await StorageService.getSignedUrl('imagens_atividades', filePath);
  return signed ?? fileUrl; // fallback para original em caso de erro
}