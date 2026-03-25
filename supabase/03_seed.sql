-- =============================================================================
-- INCLUIAI — PASSO 3: SEED DE DADOS
-- Execute APÓS o 02_schema.sql
--
-- LOGINS:
--   CEO / Super Admin → ceo@incluiai.com.br           / IncluiAI@CEO2026
--   Plano MASTER      → diretora@santosdumont.edu.br   / Master@Incluiai2026
--   Plano PRO         → professora@monteiro.edu.br     / Pro@Incluiai2026
--
-- PLANOS: FREE, PRO, MASTER  (não existe INSTITUTIONAL)
-- O CEO é super_admin via flag is_super_admin=true — não via plano especial.
-- =============================================================================

-- Garante pgcrypto disponível
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;

-- =============================================================================
-- 1. TENANTS
-- =============================================================================

INSERT INTO public.tenants (id, name, document, plan_id, is_active) VALUES
(
  '10000000-0000-0000-0000-000000000001',
  'IncluiAI Plataforma',
  '00.000.000/0001-00',
  (SELECT id FROM public.plans WHERE name = 'MASTER'),
  true
),
(
  '10000000-0000-0000-0000-000000000002',
  'Escola Municipal Monteiro Lobato',
  '11.222.333/0001-44',
  (SELECT id FROM public.plans WHERE name = 'PRO'),
  true
),
(
  '10000000-0000-0000-0000-000000000003',
  'Escola Estadual Santos Dumont',
  '55.666.777/0001-88',
  (SELECT id FROM public.plans WHERE name = 'MASTER'),
  true
)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 2. SUBSCRIPTIONS
-- =============================================================================

INSERT INTO public.subscriptions (tenant_id, plan_id, status, current_period_start, current_period_end) VALUES
(
  '10000000-0000-0000-0000-000000000001',
  (SELECT id FROM public.plans WHERE name = 'MASTER'),
  'ACTIVE', NOW(), NOW() + INTERVAL '10 years'
),
(
  '10000000-0000-0000-0000-000000000002',
  (SELECT id FROM public.plans WHERE name = 'PRO'),
  'ACTIVE', NOW(), NOW() + INTERVAL '30 days'
),
(
  '10000000-0000-0000-0000-000000000003',
  (SELECT id FROM public.plans WHERE name = 'MASTER'),
  'ACTIVE', NOW(), NOW() + INTERVAL '30 days'
)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 3. CREDITS WALLET
-- =============================================================================

INSERT INTO public.credits_wallet (tenant_id, balance, last_reset_at) VALUES
  ('10000000-0000-0000-0000-000000000001', 9999, NOW()),
  ('10000000-0000-0000-0000-000000000002', 50,   NOW()),
  ('10000000-0000-0000-0000-000000000003', 70,   NOW())
ON CONFLICT (tenant_id) DO UPDATE SET balance = EXCLUDED.balance;

-- =============================================================================
-- 4. AUTH USERS
-- O trigger handle_new_user() lê os metadados e cria public.users
-- =============================================================================

INSERT INTO auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user,
  created_at, updated_at,
  confirmation_token, recovery_token,
  email_change, email_change_token_new
) VALUES
-- CEO / Super Admin
(
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-0000-0000-000000000010',
  'authenticated', 'authenticated',
  'ceo@incluiai.com.br',
  extensions.crypt('IncluiAI@CEO2026', extensions.gen_salt('bf')),
  NOW(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"CEO IncluiAI","role":"ADMIN","tenant_id":"10000000-0000-0000-0000-000000000001","is_super_admin":"true"}',
  false, false, NOW(), NOW(), '', '', '', ''
),
-- Professora PRO
(
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-0000-0000-000000000020',
  'authenticated', 'authenticated',
  'professora@monteiro.edu.br',
  extensions.crypt('Pro@Incluiai2026', extensions.gen_salt('bf')),
  NOW(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Ana Paula Ferreira","role":"TEACHER","tenant_id":"10000000-0000-0000-0000-000000000002","is_super_admin":"false"}',
  false, false, NOW(), NOW(), '', '', '', ''
),
-- Diretora MASTER
(
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-0000-0000-000000000030',
  'authenticated', 'authenticated',
  'diretora@santosdumont.edu.br',
  extensions.crypt('Master@Incluiai2026', extensions.gen_salt('bf')),
  NOW(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Beatriz Santos Lima","role":"MANAGER","tenant_id":"10000000-0000-0000-0000-000000000003","is_super_admin":"false"}',
  false, false, NOW(), NOW(), '', '', '', ''
)
ON CONFLICT (id) DO NOTHING;

-- Verifica criação automática de public.users via trigger
DO $$
DECLARE cnt INT;
BEGIN
  SELECT COUNT(*) INTO cnt FROM public.users
  WHERE id IN (
    '10000000-0000-0000-0000-000000000010',
    '10000000-0000-0000-0000-000000000020',
    '10000000-0000-0000-0000-000000000030'
  );
  IF cnt < 3 THEN
    RAISE WARNING 'ATENÇÃO: Apenas % de 3 usuários criados em public.users. O trigger pode ter falhado. Rode 04_verify.sql.', cnt;
  ELSE
    RAISE NOTICE 'OK: % usuários criados com sucesso em public.users.', cnt;
  END IF;
END;
$$;

-- =============================================================================
-- 5. ALUNOS
-- =============================================================================

INSERT INTO public.students (
  id, tenant_id, created_by,
  full_name, birth_date, gender,
  school_name, school_year, class_name, teacher_name,
  primary_diagnosis, cid_codes,
  learning_needs, behavioral_notes,
  guardian_name, guardian_phone, guardian_email, guardian_relationship
) VALUES
(
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000020',
  'Lucas Ferreira Santos', '2016-04-12', 'M',
  'Escola Municipal Monteiro Lobato', '3º Ano', 'Turma A', 'Ana Paula Ferreira',
  'Transtorno de Déficit de Atenção e Hiperatividade (TDAH)', ARRAY['F90.0'],
  'Necessita suporte para manter foco. Beneficia-se de tarefas curtas e feedbacks frequentes.',
  'Agitação motora. Interrompe colegas. Melhora com rotina estruturada.',
  'Maria Ferreira Santos', '(11) 98765-4321', 'maria.ferreira@email.com', 'Mãe'
),
(
  '20000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000020',
  'Ana Carolina Oliveira', '2014-08-25', 'F',
  'Escola Municipal Monteiro Lobato', '5º Ano', 'Turma B', 'Ana Paula Ferreira',
  'Transtorno do Espectro Autista (TEA) — Nível 1', ARRAY['F84.0'],
  'Dificuldade com linguagem figurada. Leitura fluente. Excelente memória visual.',
  'Sensibilidade a sons altos. Prefere rotinas fixas. Estereotipias em sobrecarga.',
  'Roberto Oliveira', '(11) 91234-5678', 'roberto.oliveira@email.com', 'Pai'
),
(
  '20000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000030',
  'Pedro Henrique Costa', '2012-11-03', 'M',
  'Escola Estadual Santos Dumont', '7º Ano', 'Turma C', 'Beatriz Santos Lima',
  'Dislexia', ARRAY['F81.0','R48.0'],
  'Tempo estendido em avaliações. Beneficia-se de audiolivros e fontes maiores.',
  'Evita leitura em voz alta. Rendimento melhor em avaliações orais.',
  'Sandra Costa', '(21) 99876-5432', 'sandra.costa@email.com', 'Mãe'
),
(
  '20000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000030',
  'Maria Eduarda Ribeiro', '2015-02-28', 'F',
  'Escola Estadual Santos Dumont', '2º Ano', 'Turma A', 'Beatriz Santos Lima',
  'Síndrome de Down (Trissomia 21)', ARRAY['Q90.0'],
  'Comunicação por figuras (PECS). Atividades com suporte visual.',
  'Comunicação não-verbal predominante. Afetiva e participativa.',
  'Claudia Ribeiro', '(21) 98888-7777', 'claudia.ribeiro@email.com', 'Mãe'
)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 6. DOCUMENTOS — chain: ESTUDO_CASO → PAEE → PEI
-- =============================================================================

INSERT INTO public.documents (
  id, tenant_id, student_id, created_by,
  doc_type, title, status, content
) VALUES
('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000020',
 'ESTUDO_CASO','Estudo de Caso — Lucas Ferreira Santos','FINAL','{"diagnostico":"TDAH F90.0"}'),
('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000020',
 'ESTUDO_CASO','Estudo de Caso — Ana Carolina Oliveira','FINAL','{"diagnostico":"TEA F84.0"}'),
('30000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000030',
 'ESTUDO_CASO','Estudo de Caso — Pedro Henrique Costa','FINAL','{"diagnostico":"Dislexia F81.0"}'),
('30000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000030',
 'ESTUDO_CASO','Estudo de Caso — Maria Eduarda Ribeiro','DRAFT','{"diagnostico":"Down Q90.0"}'),
('30000000-0000-0000-0000-000000000011','10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000020',
 'PAEE','PAEE — Lucas Ferreira Santos','FINAL','{"objetivo":"Reduzir impacto do TDAH"}'),
('30000000-0000-0000-0000-000000000012','10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000020',
 'PAEE','PAEE — Ana Carolina Oliveira','FINAL','{"objetivo":"Ampliar comunicação funcional"}'),
('30000000-0000-0000-0000-000000000021','10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000020',
 'PEI','PEI — Lucas Ferreira Santos','DRAFT','{"metas":["Completar tarefas curtas","Reduzir interrupções"]}')
ON CONFLICT (id) DO NOTHING;

-- Encadeia documentos (source_id)
UPDATE public.documents SET source_id = '30000000-0000-0000-0000-000000000001' WHERE id = '30000000-0000-0000-0000-000000000011';
UPDATE public.documents SET source_id = '30000000-0000-0000-0000-000000000002' WHERE id = '30000000-0000-0000-0000-000000000012';
UPDATE public.documents SET source_id = '30000000-0000-0000-0000-000000000011' WHERE id = '30000000-0000-0000-0000-000000000021';

-- =============================================================================
-- 7. TAREFAS
-- =============================================================================

INSERT INTO public.tasks (tenant_id, created_by, assigned_to, student_id, document_id, title, description, priority, status, due_date) VALUES
('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000020','10000000-0000-0000-0000-000000000020',
 '20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000021',
 'Finalizar PEI do Lucas','Revisar metas e encaminhar para assinatura.','HIGH','PENDING', NOW() + INTERVAL '3 days'),
('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000020','10000000-0000-0000-0000-000000000020',
 '20000000-0000-0000-0000-000000000002', NULL,
 'Reunião com família da Ana Carolina','Apresentar PAEE e estratégias sensoriais.','MEDIUM','PENDING', NOW() + INTERVAL '7 days'),
('10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000030','10000000-0000-0000-0000-000000000030',
 '20000000-0000-0000-0000-000000000003', NULL,
 'Adaptar prova de Português — Pedro','Criar versão com fonte maior e texto em áudio.','HIGH','IN_PROGRESS', NOW() + INTERVAL '2 days'),
('10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000030','10000000-0000-0000-0000-000000000030',
 '20000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000004',
 'Concluir Estudo de Caso — Maria Eduarda','Finalizar seção de histórico familiar.','MEDIUM','PENDING', NOW() + INTERVAL '5 days');

-- =============================================================================
-- RESUMO FINAL
-- =============================================================================

SELECT
  'SEED CONCLUIDO' AS status,
  (SELECT COUNT(*) FROM public.tenants)   AS tenants,
  (SELECT COUNT(*) FROM public.users)     AS usuarios,
  (SELECT COUNT(*) FROM public.students)  AS alunos,
  (SELECT COUNT(*) FROM public.documents) AS documentos,
  (SELECT COUNT(*) FROM public.tasks)     AS tarefas;
