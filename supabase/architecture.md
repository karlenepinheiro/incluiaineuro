# IncluiAI — Arquitetura de Banco de Dados v2.0

## 1. Diagnóstico do Schema Atual

### Problemas Críticos

| Problema | Impacto |
|---|---|
| `tenants.type` CHECK não inclui `'INDIVIDUAL'` | `handle_new_user` falha silenciosamente ao criar tenant |
| Coluna `students.familyContext` (camelCase) ao lado de `family_context` | Inconsistência; PostgREST rejeita upserts |
| Dados relacionais em blobs JSONB (`data`, `documents`, `documentAnalyses`, `fichasComplementares` todos dentro de `students.data`) | Impossível filtrar, indexar ou auditar esses dados |
| `documents.versions` é um array JSONB dentro da tabela | Sem integridade referencial; versões não podem ser auditadas individualmente |
| `appointments` ligada a `organizations` (schema legado), não a `tenants` | Dashboard de agenda não funciona com arquitetura multi-tenant atual |
| Roles misturadas: `users.role` carrega tanto roles de app (`DOCENTE`) quanto de plataforma (`super_admin`) | Impossível distinguir usuário da plataforma de operador interno |
| Sem tabela de evoluções (`student_evolutions`) — dados na UI | Evolução com gráficos não pode ser consultada via banco |
| Sem tabela de atividades (`activities`) — dados gerados sem persistência estruturada | Créditos consumidos sem rastreio vinculado ao recurso gerado |
| LGPD armazenada em `localStorage` com fallback banco | Viola LGPD: não há audit trail de consentimento |
| `school_configs` como JSONB no tenant | Impossível buscar escola por nome ou INEP |
| `credits_wallet` tem colunas duplicadas: `balance`/`credits_available` e `total_earned`/`credits_total` | Inconsistência; código usa aliases diferentes |
| Tabelas órfãs: `organizations`, `organization_members`, `profiles`, `usuarios_legacy`, `credit_usage`, `transactions` | Resíduo do schema v0; ocupam espaço e confundem |

### O que o Schema Atual Acerta
- Arquitetura multi-tenant com `tenant_id` em todas as tabelas relevantes
- RLS habilitada com `my_tenant_id()` helper function
- `audit_logs` com hash de conteúdo e `audit_code` único
- `plans` + `subscriptions` + `credits_wallet` como camada de billing
- Trigger `handle_new_user` para provisionamento automático

---

## 2. Princípios da Nova Arquitetura

### 2.1 Multi-tenancy Estrito
Todo recurso do produto pertence a um `tenant_id`. RLS garante isolamento total. Não existe dado acessível entre tenants sem concessão explícita.

### 2.2 Normalização Onde Importa
- Dados consultáveis (evolução, atendimentos, arquivos) em tabelas próprias com colunas tipadas
- JSONB apenas para dados verdadeiramente flexíveis (structured_data de documentos, campos de fichas, configurações)

### 2.3 Auditabilidade Imutável
- `audit_logs` nunca recebe UPDATE ou DELETE — apenas INSERT
- Documentos finalizados geram `audit_code` + `content_hash` imutáveis
- Toda ação que consome crédito gera entrada no `credits_ledger`

### 2.4 LGPD by Design
- `lgpd_consents` como tabela imutável de audit trail
- Coluna `deleted_at` para soft delete de dados pessoais (ao invés de `DELETE`)
- `student_files` com controle de acesso por `tenant_id`

### 2.5 Separação de Roles
- `users` (app users): roles de produto — DOCENTE, AEE, COORDENADOR, GESTOR, CLINICO, RESPONSAVEL_TECNICO
- `admin_users` (plataforma): roles internas — super_admin, financeiro, operacional, viewer

### 2.6 Extensibilidade para Multi-IA
- `ai_usage_logs` com campo `provider` e `model` — suporta Gemini, Claude, OpenAI, modelos futuros
- `ai_providers` como tabela de configuração de provedores por tenant (roadmap)

---

## 3. Módulos do Produto

```
M01: Foundation        tenants, users, lgpd_consents
M02: Schools           schools, school_staff
M03: Students          students, student_files, student_collaborators
M04: Scheduling        appointments, service_records
M05: Documents         documents, document_versions
M06: Forms             complementary_forms, checklists
M07: Evolution         student_evolutions
M08: Activities        activities, activity_attachments
M09: Timeline          timeline_events
M10: Workflow          workflow_steps
M11: Audit             audit_logs
M12: Billing           plans, subscriptions, credits_wallet, credits_ledger, purchase_intents
M13: AI Usage          ai_usage_logs
M14: CMS               landing_settings
```

---

## 4. Diagrama de Dependências

```
auth.users
    └── tenants (M01)
            ├── users (M01)
            │       └── lgpd_consents (M01)
            ├── schools (M02)
            │       └── school_staff (M02)
            ├── students (M03)
            │       ├── student_files (M03)
            │       ├── student_collaborators (M03)
            │       ├── appointments (M04)
            │       ├── service_records (M04)
            │       ├── documents (M05)
            │       │       └── document_versions (M05)
            │       ├── complementary_forms (M06)
            │       ├── checklists (M06)
            │       ├── student_evolutions (M07)
            │       ├── activities (M08)
            │       │       └── activity_attachments (M08)
            │       └── timeline_events (M09)
            ├── workflow_steps (M10) -> documents
            ├── audit_logs (M11)
            ├── subscriptions (M12)
            ├── credits_wallet (M12)
            ├── credits_ledger (M12)
            ├── purchase_intents (M12)
            └── ai_usage_logs (M13)

plans (M12) — tabela global, sem tenant_id
landing_settings (M14) — tabela singleton global
```

---

## 5. Detalhamento por Módulo

### M01 — Foundation

**`tenants`**
- Unidade de isolamento do sistema
- `type`: `INDIVIDUAL` | `PROFESSIONAL` | `CLINIC` | `SCHOOL`
- Campos desnormalizados de billing (`plano_ativo`, `status_assinatura`, `student_limit_base`) para leituras rápidas sem JOIN
- `school_configs` removido — escolas viram tabela própria (M02)

**`users`**
- `role` restrito a roles de produto: `DOCENTE` | `AEE` | `COORDENADOR` | `GESTOR` | `CLINICO` | `RESPONSAVEL_TECNICO`
- LGPD inline (`lgpd_accepted`, `lgpd_accepted_at`, `lgpd_term_version`) para leitura rápida
- `photo_url` persiste URL do Supabase Storage

**`lgpd_consents`**
- Tabela append-only (sem UPDATE/DELETE via RLS)
- Cada aceite/revogação gera nova linha
- `ip_address` + `user_agent` para evidência legal

---

### M02 — Schools

**`schools`**
- Entidade de escola separada do tenant
- Um tenant tipo `SCHOOL` ou `PROFESSIONAL` pode ter múltiplas escolas
- `inep_code` para identificação oficial do MEC

**`school_staff`**
- Membros da equipe por escola (não são usuários do sistema)
- Usados para preencher campos de documentos (regente, AEE, coordenador)

---

### M03 — Students

**`students`**
- `is_external` + campos `external_*` substituem `isExternalStudent` da UI
- `school_id` FK para `schools` — permite consultas por escola
- Soft delete: `deleted_at` ao invés de DELETE (LGPD)
- Colunas `familyContext` (camelCase) removidas — apenas `family_context`
- Arrays de texto (`diagnosis`, `cid`, `abilities`, etc.) mantidos — são valores livres

**`student_files`**
- Substitui o array `documents` dentro de `students.data`
- `storage_path` aponta para Supabase Storage
- `ai_synthesis`, `ai_pedagogical_points`, `ai_suggestions` para análise IA de laudos

**`student_collaborators`**
- Convites para profissionais externos participarem de documentos
- `access_code` para acesso sem login
- `expires_at` para segurança

---

### M04 — Scheduling

**`appointments`**
- Migrado de `organizations` para `tenants`
- `recurrence` JSONB para agendamentos recorrentes (semanal, mensal)
- Suporta agendamentos sem aluno (ex: reunião de equipe)

**`service_records`**
- Registro do atendimento executado (pode ter appointment_id associado ou ser avulso)
- `attendance`: `PRESENTE` | `FALTA` | `REPOSICAO`
- `audio_url` para gravações de sessão (MASTER+)

---

### M05 — Documents

**`documents`**
- `type` expandido com constraint explícita dos tipos suportados
- `structured_data` JSONB mantido (flexibilidade de seções/campos é legítima)
- `deleted_at` para soft delete

**`document_versions`**
- Extrai o array `versions` do documento para tabela própria
- `UNIQUE (document_id, version_number)` garante integridade
- Cada versão é consultável individualmente

---

### M06 — Forms & Checklists

**`complementary_forms`**
- Tipos expandíveis via CHECK constraint
- `fields` JSONB mantido (formulários têm estrutura variável)

**`checklists`**
- Nova tabela para checklists pedagógicos
- `items` JSONB: `[{id, label, checked, notes, category}]`

---

### M07 — Evolution

**`student_evolutions`**
- Substitui `evolutions` dentro de `students` (que estava na UI, não no banco)
- `scores` JSONB: `[{label, value, max, color}]` — suporta múltiplos eixos de avaliação
- `evolution_date` como `date` para agrupamento temporal em gráficos
- Índice em `(student_id, evolution_date)` para queries de série temporal

---

### M08 — Activities

**`activities`**
- `student_id` nullable — atividades podem ser templates reutilizáveis
- `is_template` para biblioteca de atividades do tenant
- `ai_generated`, `ai_model`, `credits_consumed` para rastreio de uso

**`activity_attachments`**
- Imagens, PDFs e áudios de atividades em tabela separada
- `sort_order` para reordenamento na UI
- `type`: `IMAGE` | `PDF` | `AUDIO` | `OTHER`

---

### M09 — Timeline

**`timeline_events`**
- Agregação cross-modular da timeline vertical do aluno
- `linked_entity_type` + `linked_entity_id` apontam para a fonte real
- Gerada automaticamente por triggers (ou explicitamente pela aplicação)
- Não é fonte de verdade — é índice de apresentação

---

### M10 — Workflow

**`workflow_steps`**
- Rastreia etapas de aprovação/parecer de documentos
- `step_order` define sequência
- `status`: `PENDING` | `IN_PROGRESS` | `APPROVED` | `REJECTED` | `SKIPPED`

---

### M11 — Audit

**`audit_logs`**
- Tabela append-only: RLS permite INSERT, proíbe UPDATE e DELETE
- `content_hash` SHA-256 do conteúdo do documento no momento da ação
- `audit_code` único e legível (8 chars alfanumérico) para validação pública
- `user_agent` adicionado para rastreabilidade

---

### M12 — Billing

**`plans`**
- Feature flags explícitas como colunas booleanas (não JSONB)
- `includes_export_word`, `includes_audit_print`, `includes_uploads`, `has_watermark`
- `features` JSONB para flags futuras sem alterar schema

**`subscriptions`**
- `status` adicionado: `TRIALING` — período de teste
- `provider_customer_id` para portal do cliente no gateway

**`credits_wallet`**
- Consolidado: remove duplicatas (`balance`/`total_earned`)
- Colunas canônicas: `credits_total`, `credits_available`, `credits_spent`

**`credits_ledger`**
- `EXPIRY` adicionado às operações (créditos expiram)
- `ref_type` para identificar a origem do consumo

**`purchase_intents`**
- Nova tabela: rastreia checkout antes do pagamento
- `kind`: `PLAN_UPGRADE` | `AI_CREDITS` | `STUDENT_SLOTS`
- `expires_at` para intents não completados

---

### M13 — AI Usage

**`ai_usage_logs`**
- `provider`: `gemini` | `openai` | `claude` | `custom`
- `operation_type`: `field_ai` | `full_document_ai` | `evolution_report_ai` | `adapted_activity_ai`
- `prompt_tokens` + `completion_tokens` para futura precificação por token
- `success` + `error_message` para monitoramento de falhas

---

### M14 — CMS

**`landing_settings`**
- Singleton (`singleton_key = 'default'`)
- Sem alteração estrutural — apenas limpeza de defaults

---

## 6. Estratégia de RLS

```
Padrão de isolamento de tenant:
  USING (tenant_id = public.my_tenant_id())

Exceções:
  - audit_logs: INSERT com check, sem UPDATE/DELETE
  - landing_settings: SELECT público, UPDATE apenas admin
  - plans: SELECT público (anon + authenticated)
  - lgpd_consents: INSERT próprio, SELECT próprio
  - timeline_events: SELECT por tenant
  - student_files: SELECT por tenant + student_id
```

---

## 7. Índices Recomendados

```sql
-- Performance crítica
idx_students_tenant      (students.tenant_id)
idx_students_school      (students.school_id)
idx_students_tipo        (students.tipo_aluno)
idx_documents_student    (documents.student_id)
idx_documents_tenant     (documents.tenant_id)
idx_documents_type       (documents.type, documents.status)
idx_evolutions_student   (student_evolutions.student_id, student_evolutions.evolution_date)
idx_service_records_student (service_records.student_id, service_records.session_date)
idx_appointments_tenant  (appointments.tenant_id, appointments.start_at)
idx_timeline_student     (timeline_events.student_id, timeline_events.event_date DESC)
idx_audit_code           UNIQUE (audit_logs.audit_code)
idx_ai_usage_tenant      (ai_usage_logs.tenant_id, ai_usage_logs.created_at)
idx_credits_ledger_tenant (credits_ledger.tenant_id, credits_ledger.created_at)
```

---

## 8. Ordem de Implantação

```
FASE 1 — Foundation (sem risco, additive)
  1.1 Corrigir CHECK de tenants.type (adicionar 'INDIVIDUAL')
  1.2 Adicionar colunas faltando em users (photo_url, lgpd_*, updated_at)
  1.3 Criar tabela lgpd_consents
  1.4 Criar tabela schools
  1.5 Criar tabela school_staff

FASE 2 — Students (baixo risco)
  2.1 Adicionar colunas em students (is_external, external_*, school_id FK, deleted_at)
  2.2 Criar tabela student_files
  2.3 Criar tabela student_collaborators
  2.4 Remover coluna familyContext (depois de migrar dados para family_context)

FASE 3 — Scheduling (médio risco — requer migração de dados)
  3.1 Criar nova tabela appointments (com tenant_id, sem organization_id)
  3.2 Migrar dados de appointments legado (se existirem)
  3.3 Criar tabela service_records

FASE 4 — Documents (médio risco)
  4.1 Criar tabela document_versions
  4.2 Migrar documents.versions[] para document_versions
  4.3 Adicionar deleted_at em documents

FASE 5 — Forms, Evolution, Activities (baixo risco — novas tabelas)
  5.1 Criar complementary_forms (já existe — apenas ajustes de constraint)
  5.2 Criar tabela checklists
  5.3 Criar tabela student_evolutions
  5.4 Criar tabela activities
  5.5 Criar tabela activity_attachments

FASE 6 — Timeline, Workflow, Audit (baixo risco)
  6.1 Criar tabela timeline_events
  6.2 Criar tabela workflow_steps
  6.3 Adicionar user_agent em audit_logs

FASE 7 — Billing (atenção ao créditos_wallet)
  7.1 Adicionar feature flags em plans
  7.2 Adicionar TRIALING em subscriptions.status
  7.3 Consolidar credits_wallet (renomear/adicionar colunas)
  7.4 Adicionar EXPIRY em credits_ledger.operation
  7.5 Criar tabela purchase_intents

FASE 8 — AI Usage (nova tabela, sem risco)
  8.1 Criar tabela ai_usage_logs

FASE 9 — Limpeza (ALTO RISCO — só após validar que nada usa mais)
  9.1 Deprecar tabela organizations
  9.2 Deprecar tabela organization_members
  9.3 Deprecar tabela profiles
  9.4 Deprecar tabela usuarios_legacy
  9.5 Deprecar tabela credit_usage
  9.6 Deprecar tabela transactions
```

---

## 9. Riscos e Dependências

| Risco | Mitigação |
|---|---|
| `appointments` legada ligada a `organizations` — código pode ainda referenciar | Criar nova tabela `appointments` com nome diferente temporariamente? Não — o código JS já usa `appointments` com `tenant_id`. Verificar queries antes da migração. |
| `students.data` JSONB contém `documents`, `fichasComplementares`, `evolutions` | Migrar dados via script antes de remover campos. A aplicação escreve nos dois lugares durante transição. |
| `credits_wallet.balance` vs `credits_available` — código usa ambos | `migration_safe.sql` adiciona `credits_available` sem remover `balance`. Frontend atualizado gradualmente. |
| Trigger `handle_new_user` falha se tenant CHECK não incluir `INDIVIDUAL` | Corrigir como PRIMEIRO passo da migração. |
| RLS de `students` pode bloquear novos campos antes de políticas serem atualizadas | Testar RLS em ambiente de staging antes de produção. |
| Soft delete (`deleted_at`) requer atualização de todas as queries que fazem SELECT sem filtrar `deleted_at IS NULL` | Criar VIEWS `active_students` e `active_documents` para compatibilidade. |
