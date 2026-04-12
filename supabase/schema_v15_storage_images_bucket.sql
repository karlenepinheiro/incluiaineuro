-- Schema v15 — Bucket de imagens geradas pelo AtivaIA / EduLensIA / NeuroDesign
-- Execute no Supabase Dashboard → SQL Editor

-- 1. Cria o bucket público (se não existir)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'imagens_atividades',
  'imagens_atividades',
  true,          -- público: URLs acessíveis sem autenticação
  10485760,      -- 10 MB por arquivo
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 2. Policy: qualquer usuário autenticado pode fazer upload na própria pasta (tenant_id/)
CREATE POLICY "atividades_upload" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'imagens_atividades'
    AND (storage.foldername(name))[1] = (SELECT tenant_id::text FROM public.users WHERE id = auth.uid() LIMIT 1)
  );

-- 3. Policy: leitura pública (imagens são usadas em PDFs/previews públicos)
CREATE POLICY "atividades_read_public" ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'imagens_atividades');

-- 4. Policy: dono pode deletar
CREATE POLICY "atividades_delete" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'imagens_atividades'
    AND (storage.foldername(name))[1] = (SELECT tenant_id::text FROM public.users WHERE id = auth.uid() LIMIT 1)
  );
