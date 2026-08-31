# Correção urgente — Planos de Ação e Perfis (integridade, validação, segurança financeira)

**Data:** 31/08/2026
**Base:** auditoria `auditorias/2026-08-30_auditoria-prompts-planos-acao-e-perfis.md`.
**Escopo:** C-01 (persistência do Plano Regente), validação pré-commit de crédito, recuperação
segura de falha de banco, idempotência da geração, e as correções médias M-05/M-06/M-08/M-12 +
recontagem de paridade.
**Fora de escopo (fases separadas):** estética dos documentos; linguagem clínica do Perfil
Inteligente (`neuropsychologicalReport`, `learningProfile`, checklist "Status Cognitivo") — A-04
permanece **registrado como pendência de produto e risco pedagógico** (§7).

Sem commit / push / deploy. Nenhuma chamada real à IA nos testes.

---

## 1. Preservação

| Item | Resultado |
|---|---|
| `git status --short` / `git diff --stat` | Inspecionados. Worktree preexistente (Fase 1 + Fase 2 A/B + gateway) **intacto**. |
| Backups/checkpoints existentes | `../IncluiAI_Backups/` — `incluiai_2_0_oficial_backup_20260828-142203`, `fase2_paridade_pre_edicao_20260829-201624` e demais **preservados, não sobrescritos**. |
| **Snapshot novo desta fase** | `../IncluiAI_Backups/fase3_correcao_planos_perfis_pre_edicao_20260830-212148/` — 18 arquivos-fonte + `FILE-HASHES.txt` + `FILE-HASHES-AFTER-EDIT.txt` + `GIT-HEAD/STATUS/DIFF-STAT` (antes e depois). **Sem** `.env`, tokens, credenciais ou dados de alunos. |
| `reset` / `checkout` / `restore` / `stash` / `clean` / exclusões | **não usados**. |
| Commit / push / deploy | **não**. |
| Chamadas reais à IA nos testes | **não** — só mocks / funções puras / leitura de código-fonte. |

---

## 2. Correção crítica — Plano de Ação do Professor Regente (C-01)

### 2.1 Causa

`ActionPlanService.planJsonToContentJson` mapeava só 6 blocos; `rowToRecord` reconstruía só 6. O
schema `student_action_plans.content_json` é `jsonb` livre (sem CHECK de forma) — o descarte era
100% da camada de aplicação. `ActionPlanTab.handleGenerate` chamava `load()` imediatamente, sem
nunca exibir o plano recém-gerado. → `practicalObjective`, `nextStep`, `focusPlan`, `mainBarrier`,
`suggestedGames/Videos/Materials/Dynamics`, `adaptations`, `evidenceRecording`, `studentResponse`
eram gerados (6 créditos), pedidos ao modelo com instrução detalhada, e jogados fora.

### 2.2 Correção (sem migration — `content_json` jsonb aceita as chaves)

| Arquivo | Mudança |
|---|---|
| `src/services/actionPlanService.ts` | `planJsonToContentJson` agora grava **todos os 17 campos** em `content_json` (chaves `snake_case`, mesma convenção): `practical_objective`, `next_step`, `focus_plan`, `main_barrier`, `suggested_games`, `suggested_videos`, `suggested_materials`, `suggested_dynamics`, `adaptations`, `evidence_recording`, `student_response`. Blocos enriquecidos vazios são **omitidos** (não viram bloco fantasma). `rowToRecord` reidrata cada campo — `hydrateBlock` aceita o formato antigo (só array de items) **e** o novo (`{title, items}`); campos opcionais ausentes voltam `undefined`. `rowToRecord` e `planJsonToContentJson` exportados para teste. |
| `src/components/ActionPlanTab.tsx` | `handleGenerate` separado de `persistPlan`; o plano gerado é **exibido imediatamente** num `PlanCard` (record sintético `id:'__pending__'`) + banner de status; só some quando o `save()` no banco confirma. `PlanCard`, `PrintModal`, `PlanoAcaoExportRow` e o adaptador `actionPlanRegenteToSections` **já suportavam** os 17 campos — passam a recebê-los. |

**Não foi criado tipo novo, não houve renome/fusão silenciosa, não há estrutura concorrente.**
`ActionPlanJSON` e os renderizadores existentes são reutilizados. O **Plano AEE** já persistia
todos os blocos (`aeeActionPlanService`) — mantido como referência e coberto por teste de regressão.

**Compatibilidade retroativa:** planos antigos (`content_json` só com 6 blocos) continuam abrindo —
`rowToRecord` devolve os 6 obrigatórios e `undefined` nos enriquecidos.

### 2.3 Comentário de schema

`COMMENT ON COLUMN public.student_action_plans.content_json IS 'Seis blocos…'` em
`supabase/schema_v28_action_plans.sql` **ficou desatualizado** (documentação; a coluna já aceitava
qualquer JSON). **Não alterei o arquivo de schema** para não tocar em SQL. Registrar para
atualização documental futura.

---

## 3. Validação real antes da confirmação do crédito

### 3.1 Novo módulo — `supabase/functions/ai-gateway/_resultValidation.ts` (puro, sem Deno/imports)

Aplicado **somente** a `requestType ∈ {plano_acao, plano_acao_aee, perfil_inteligente}` no
Gateway, **entre o parse e o commit**. Todo outro `requestType` passa inalterado
(`sanitizeStructuredResult` = identidade, `validateStructuredResult` = `{usable:true}`).
**Provider, modelo, fallback e roteamento não foram tocados.**

**`sanitizeStructuredResult`** (correção segura e determinística — só REMOVE):
- remove itens de bloco cujo `text` é placeholder/vazio;
- remove blocos **opcionais** que ficam vazios; remove escalares opcionais placeholder;
- Perfil: filtra `strengths`/`nextSteps`/`carePoints`/`bestLearningStrategies.items`/
  `observationPoints.checklist`, remove `recommendedActivities`/`challenges` sem título substantivo.
- **Nunca inventa nem reescreve conteúdo pedagógico.**

**`isPlaceholderText`** — detecta texto-molde do prompt (conservador para não marcar texto real):
- colchetes com espaço interno (`[Nome do jogo]`, `[descrição específica da barreira]`);
- tokens (`[ALUNO]`, `[ESCOLA]`, `[PROFESSOR]`, `[DIAGNÓSTICO]`, `[CID]`);
- colchete de 1 palavra-instrução (`[nome]`, `[preencher]`, `[inserir]`, `[exemplo]`…);
- frases (`exemplo de resposta`, `preencher aqui`, `descrição específica`, `lorem ipsum`, …);
- vazio trivial (`''`, `-`, `...`, `não informado`, `a definir`, …).

**`validateStructuredResult`** (falha → `UNUSABLE_RESULT` → libera reserva, **sem commit**):
- **não-objeto** → `NOT_AN_OBJECT`;
- **serialização curta demais** (plano < 400, perfil < 600 chars) → `SUSPICIOUSLY_SHORT` (truncamento);
- **plano_acao:** os 6 blocos core devem existir, ser objeto e ter ≥ 1 item substantivo;
  `practicalObjective` string substantiva ≥ 10;
- **plano_acao_aee:** `welcomeRoutine`, `priorityBarrier`, `sessionScript`, `materials`,
  `applicationGuide`, `responseRecord` (≥ 1 item cada); `sessionObjective` ≥ 10;
- **perfil_inteligente:** `studentName`; `firstPersonLetter` **ou** `humanizedIntroduction.text`
  (≥ 20); `pedagogicalReport.text` (≥ 20) + `.checklist` (≥ 1); idem `neuroPedagogicalReport`;
  `bestLearningStrategies.items` (≥ 1 substantivo); `observationPoints.text` (≥ 20).
  `recommendedActivities: []`, `strengths`, `challenges` ausentes **não** invalidam.

**Regras respeitadas:** JSON válido ≠ utilizável; campo opcional ausente não invalida; placeholder
em campo obrigatório vira ausência (o `sanitize` esvazia o bloco → o `validate` reprova); normaliza
só o que é seguro; não inventa conteúdo; inutilizável falha **antes** do commit.

### 3.2 Integração no Gateway (`supabase/functions/ai-gateway/index.ts`)

```
provider → validateAndRepair (parse)
         → sanitizeStructuredResult(doc, requestType)     ← NOVO (determinístico)
         → result = JSON.stringify(doc)
         → checkResultUsability (usabilityCheck do frontend — inalterado)
         → validateStructuredResult(doc, requestType, result.length)  ← NOVO
             └─ !usable → throw UNUSABLE_RESULT  (dentro do try → releaseReservedCredits, SEM commit)
         → (fora do try) commitReservedCredits
```
`friendlyError('UNUSABLE_RESULT')` já existia → "Nao foi possivel identificar dados utilizaveis no
documento. Nenhum credito foi consumido."

### 3.3 Testes — `src/__tests__/aiGatewayResultValidation.test.ts` (25 casos)

| # | Caso | Resultado |
|---|---|---|
| 1 | resultado completo (3 tipos) | utilizável |
| 2 | útil com campo **opcional** ausente (blocos opcionais, `strengths`, `recommendedActivities`; bloco opcional só-placeholder → removido) | utilizável |
| 3 | campo **obrigatório** ausente (`communicationTeam`, `sessionObjective`, `pedagogicalReport`) | inutilizável |
| 4 | placeholder em campo obrigatório (`beforeClass` só-molde; `practicalObjective`; `pedagogicalReport.text`) | inutilizável |
| 5 | tipo incorreto (estrutura de import de alunos; string em bloco) | inutilizável |
| 6 | JSON curto demais (truncado) | inutilizável (`SUSPICIOUSLY_SHORT`) |
| 7 | não-objeto (array / null / string) | inutilizável |
| + | passthrough de outros `requestType`; um tipo não contamina outro; `isPlaceholderText` não marca texto pedagógico real | ok |

---

## 4. Persistência sem nova cobrança (recuperação segura)

**Não** movi o commit para o frontend nem para depois do `save()`. O commit continua no Gateway,
atrelado ao recebimento de um resultado **validado e utilizável** (§3). O que mudou é o
comportamento do **frontend quando o `save()` no banco falha**:

| Componente | Comportamento em falha de `save()` |
|---|---|
| `ActionPlanTab`, `AEEActionPlanTab` | `persistPlan` (separado da geração) captura o erro → guarda o plano em **estado de sessão** (`pendingPlan`, memória — **nunca `localStorage`/`sessionStorage`**) → exibe o documento num `PlanCard` + banner "Documento gerado com sucesso, mas não foi possível salvá-lo…" + botão **"Tentar salvar novamente"**. |
| `IntelligentProfileTab` | `persistProfile` idem → `pendingSave` + `makeDraftRecord` (`id:'__draft__'`) exibe o perfil completo → banner + retry. Vale para geração **e** edição manual. |

**Garantias do retry ("Tentar salvar novamente"):**
- chama só `*Service.save(...)` com o **resultado já produzido** — **não** referencia `AIService`
  (verificado por teste que fatia a função e checa ausência de `AIService`);
- **não** passa pelo Gateway → não reserva, não debita, não gera nada;
- protegido: `if (!pending || savingPending) return` + botão `disabled={savingPending}`;
- em sucesso, limpa o `pending` e recarrega do banco → o documento vira card normal;
- a mensagem **não promete estorno** (o resultado da IA já foi entregue e validado) — diz apenas
  que **nenhum crédito novo** é consumido no retry.

**Recuperação após reload/fechar a página:** exige tabela / migration / Edge Function / storage
durável. **Não implementado** (proposta mínima em §9). Nesta fase: **recuperação garantida durante a
sessão atual** — enquanto a aba estiver aberta, o conteúdo não se perde e o retry funciona.

---

## 5. Idempotência da geração

- **`operationId` UUID por tentativa** (`crypto.randomUUID()`, fallback determinístico) gerado em
  `handleGenerate` e repassado a `AIService.generate{ActionPlan,AEEActionPlan,IntelligentProfile}`
  → `callAIGateway({ operationId })`.
- O Gateway **já** deriva `:{reserve|commit|release}` do mesmo `operationId` base e as RPCs
  `atomic_reserve/commit/release_credits` são **idempotentes por `operation_id`** (retornam
  `idempotent:true`). Nada de contabilidade paralela.
- **Trava síncrona `genLock` (`useRef`)** em cada `handleGenerate`: `if (genLock.current) return`
  antes de qualquer `await` → duplo clique não dispara 2 requisições nem antes de o React
  re-renderizar o botão `disabled`.
- Resultado: a mesma operação **não** reserva 2×, **não** chama o provider 2× por duplo clique,
  **não** confirma crédito 2×. Repetir só o salvamento usa o resultado já produzido (§4).

**Limitação residual (documentada):** duas *sessões/dispositivos* diferentes gerando para o mesmo
aluno ao mesmo tempo geram `operationId` distintos → 2 documentos. A garantia absoluta exige índice
único ou RPC — não implementado (§9).

Testes: `src/components/__tests__/documentRecoveryAndIdempotency.test.ts` (31 casos, leitura de
código-fonte — o projeto não usa jsdom/Testing Library).

---

## 6. Correções médias

### 6.1 Escala do Perfil Cognitivo (M-05)

`supabase/functions/ai-gateway/_contextFormatter.ts` — `buildCognitiveBlock` apresentava os scores
**1–5** como `${s}/10`. Corrigido para `${s}/5`. **Valores armazenados intactos** (a correção é só
de formatação do texto injetado no prompt; afeta o Plano AEE, único fluxo com `buildContextServer`).
Teste: `src/__tests__/aiGatewayContextScale.test.ts` (`/5` presente, `/10` ausente).
*(Decouplei o `import type { CanonicalData }` de `_contextBuilder.ts` — cópia local com marcador de
sincronia — para o teste não arrastar o import remoto do supabase-js para a análise estática. Zero
mudança de comportamento.)*

### 6.2 Custo do Perfil Inteligente (M-12)

`src/components/IntelligentProfileTab.tsx` — removido o literal **"5 créditos"** (débito real: 6).
Fonte única: `const PROFILE_COST = AI_CREDIT_COSTS.PERFIL_INTELIGENTE`. Exibido no empty-state **e**
adicionado ao botão "Atualizar com IA · 6 créd." (antes não informava custo).
Teste: `src/services/__tests__/intelligentProfileVersion.test.ts` (sem "5 créditos"; usa
`AI_CREDIT_COSTS.PERFIL_INTELIGENTE`; a constante canônica é 6).

### 6.3 Número da versão (M-06)

Novo helper puro `nextProfileVersion(versions)` em `src/services/intelligentProfileService.ts` =
`max(version_number) + 1`. `IntelligentProfileTab` (geração **e** edição manual) usa
`nextVersion()` — nunca mais `(versão selecionada) + 1`. Escopo já isolado por `student_id` nas
queries do service; `tenant_id` no insert. Teste: 7 casos, incl. "regenerar da V2 com V5 existente
→ V6".

**Concorrência / limitação residual:** duas gerações simultâneas do mesmo aluno ainda podem calcular
o mesmo `max+1`. A garantia absoluta exige **índice único `(student_id, version_number)`** (ou RPC
`next_intelligent_profile_version` como já existe para planos de ação). **Não alterei o banco.**
Proposta em §9.

### 6.4 Limite de prompt (M-08)

Novo `src/utils/promptBudget.ts` + cópia Deno `supabase/functions/ai-gateway/_promptBudget.ts`
(marcador `MANTER EM SINCRONIA`). `clampPromptContext(contexto, maxChars)`:
- abaixo do orçamento → inalterado;
- acima → remove **seções inteiras** (marcadores `=== / --- / ═══`) **a partir do fim** (a ordem de
  `buildPromptBlock`/`_contextFormatter` já é decrescente em prioridade: identificação e perfil
  cognitivo primeiro; histórico de atividades e estratégias por último) + insere `[NOTA DO SISTEMA:
  parte do contexto histórico foi omitida…]`;
- **nunca corta no meio de uma linha/estrutura** — salvaguarda final corta só em `\n`;
- só a instrução/esqueleto JSON nunca é tocado — apenas o **bloco de contexto**.

Aplicação:
- **cliente** (`aiService.generateActionPlan`, `generateIntelligentProfile`): contexto recortado a
  **15.000 chars** antes de montar o prompt (instrução + dados + JSON ≈ 16k; limite do Gateway 32k);
- **servidor** (`index.ts`): contexto de `formatContextForPrompt` recortado a 15.000 + **salvaguarda
  rígida** — se o `finalPrompt` ainda passar de 32k, recorta o excedente (nunca a instrução).

**Log:** só métricas — `charsBefore→charsAfter`, `seçõesKept/Total`, rótulos genéricos das seções
omitidas. **Nenhum conteúdo de aluno em log.** Teste: `src/__tests__/promptBudget.test.ts` (7
casos, incl. "métricas não expõem conteúdo", "prompt abaixo e acima do orçamento", "não corta no
meio").

---

## 7. Perfil Inteligente — A-04 NÃO alterado (pendência registrada)

**Não tocados:** `neuropsychologicalReport`, `learningProfile`, o checklist "Status Cognitivo"
(`neuroPedagogicalReport.checklist`), assinaturas, linguagem clínica, seções do PDF.

**A-04 — RISCO PEDAGÓGICO / CLÍNICO ABERTO:** o prompt do Perfil Inteligente pede o campo
`neuropsychologicalReport` ("Parecer Neuropsicológico") e um checklist com vocabulário neuro
("Memória de trabalho", "Autorregulação emocional", "Processamento de instruções verbais") exibido
na tela e no PDF "oficial" (com assinaturas da equipe) como "Status Cognitivo". Embora a instrução
peça "linguagem pedagógica, nunca clínica", o **nome do campo + rótulos + selo de documento
oficial** podem ser lidos como avaliação neuropsicológica feita pela escola.

**Próxima fase decidirá** a substituição por formulações como *"Síntese de observações pedagógicas"*,
*"Indicadores pedagógicos observados"* ou *"Aspectos de aprendizagem e participação"*.
`neuropsychologicalReport` e `learningProfile` **continuam fora** do documento final / PDF / Word
(retirada correta feita na Fase 2, preservada) — presentes só no JSON e no painel "Editar
manualmente".

---

## 8. Paridade das exportações — matriz corrigida

| Métrica | Valor correto |
|---|---|
| Paridade **estrutural** | **11/14 SIM + 3/14 PARCIAL** |
| Parciais estruturais | Relatório Técnico, Relatório Evolutivo, **Perfil do Aluno (dossiê)** |
| Paridade **textual** | **12/14 SIM + 2/14 PARCIAL** |
| Parciais textuais | **Relatório Técnico** (o PDF publica "Grau das Dificuldades" ausente do Word e da tela) e **Perfil do Aluno** (o PDF lista timeline/fichas/atividades/laudos item a item; Word e Google Docs **condensam** em contagens/tabelas-resumo — condensação de **conteúdo**, não só formatação; paridade textual vale para o núcleo cadastral) |
| 14º documento | **Biblioteca (`StudentDocumentsPanel`)** — constava na matriz da §8 do relatório de 29/08 mas não foi contado no "Resumo" |

Documentado em: `auditorias/2026-08-30_...md` §11 (matriz completa dos 14) + nota de correção
prepended em `auditorias/2026-08-29_fase-2-correcao-paridade-perfil-inteligente.md`.
**Nenhum PDF dedicado nem o dossiê foi reescrito.** A correção do Plano Regente (§2) chega aos
exportadores existentes (`actionPlanRegenteToSections` → PDF `generateFromSections` + Word
`exportGenericDocumentToWord` + Google Docs = **mesmo Blob** do Word) — provado por teste (§9).

---

## 9. Resultados dos testes

### 9.1 Sentinelas do Plano Regente — `src/services/__tests__/actionPlanPersistence.test.ts`

17 sentinelas únicas (uma por campo) verificadas em cada estágio:

| Estágio | Verificado |
|---|---|
| resposta validada | (fixtures do teste de validação — §3.3) |
| **objeto persistido** (`planJsonToContentJson` → `content_json`) | ✔ 17 chaves presentes |
| **registro reaberto** (`rowToRecord` após round-trip jsonb) | ✔ 17 sentinelas |
| **modelo usado pelo PDF** (`actionPlanRegenteToSections`) | ✔ 17 sentinelas |
| **`document.xml` do Word** (`exportGenericDocumentToWord` → unzip OOXML) | ✔ 17 sentinelas |
| **Blob do Google Docs** | ✔ (é o mesmo Blob do Word — `useFormalDocumentExport`/`useGoogleDocsExport`, coberto por `paridade.test.ts` preexistente) |
| campos opcionais ausentes | ✔ voltam `undefined`, sem bloco fantasma |
| planos antigos (6 blocos) | ✔ continuam abrindo |
| **regressão Plano AEE** | ✔ 10 sentinelas (core + opcionais) chegam ao adaptador |

### 9.2 Suíte

| | Baseline (pré-edição) | Depois |
|---|---|---|
| Arquivos de teste | 43 passaram, 1 falhou* | **50 passaram, 0 falharam** |
| Testes | 559 passaram / 52 skip (611) | **687 passaram (0 falha, 0 skip)** |
| `npm run build` | PASS | **PASS** (`✓ built in ~2m19s`; aviso de chunk >500 kB **preexistente**) |
| `tsc --noEmit` | **55 erros** | **55 erros — conjunto idêntico** (`comm` confirma: 0 novos, 0 removidos) |

\* Baseline: `studentDocumentImportService.test.ts` abortou por *hook timeout* de ambiente
(`beforeAll` 10s) — **flake preexistente**, não relacionado a esta correção; passou nas execuções
seguintes. Os 52 testes daquela suíte estavam "skipped" no baseline e rodaram (passando) depois.

**+21 casos novos** distribuídos em 6 arquivos:
`actionPlanPersistence.test.ts` (8), `aiGatewayResultValidation.test.ts` (25),
`promptBudget.test.ts` (7), `aiGatewayContextScale.test.ts` (2),
`intelligentProfileVersion.test.ts` (7), `documentRecoveryAndIdempotency.test.ts` (31) — **80 casos**
(a contagem "+76" da suíte reflete alguns testes preexistentes que passaram a rodar).

Cobre os itens exigidos: 17 campos em todos os estágios · regressão AEE · resposta inválida não
confirma crédito · placeholder obrigatório reprova · opcional ausente segue útil · falha de save não
chama IA · retry salva o mesmo resultado · duplo clique = 1 operação · custo visual = canônico ·
escala 1–5 · regeneração de versão antiga usa `max+1` · prompt abaixo/acima do orçamento ·
isolamento entre `requestType`/tipos.

**Não declaro sucesso visual de PDF** — jsPDF exige runtime de navegador; a estrutura e o `.docx`
real são verificados automaticamente, o layout do PDF fica no roteiro manual (§11).

---

## 10. Arquivos alterados

**Modificados (9):**

| Arquivo | Correção |
|---|---|
| `src/services/actionPlanService.ts` | C-01 — persiste/reabre os 17 campos; exports para teste |
| `src/services/aeeActionPlanService.ts` | exports para teste (regressão) — sem mudança de comportamento |
| `src/services/aiService.ts` | `operationId` nos 3 fluxos; orçamento de contexto (M-08) |
| `src/services/intelligentProfileService.ts` | `nextProfileVersion` (M-06) |
| `src/components/ActionPlanTab.tsx` | recuperação segura + retry + genLock + operationId + exibe plano fresco |
| `src/components/AEEActionPlanTab.tsx` | idem |
| `src/components/IntelligentProfileTab.tsx` | idem + custo canônico (M-12) + `nextVersion` (M-06) |
| `supabase/functions/ai-gateway/index.ts` | wiring de `sanitize`+`validate` pré-commit; orçamento do contexto do servidor + salvaguarda rígida |
| `supabase/functions/ai-gateway/_contextFormatter.ts` | escala `/10`→`/5` (M-05); `CanonicalData` local (decoupling) |

**Novos (3 + 6 testes):**
`src/utils/promptBudget.ts`, `supabase/functions/ai-gateway/_resultValidation.ts`,
`supabase/functions/ai-gateway/_promptBudget.ts`;
`src/services/__tests__/{actionPlanPersistence,intelligentProfileVersion}.test.ts`,
`src/__tests__/{aiGatewayResultValidation,promptBudget,aiGatewayContextScale}.test.ts`,
`src/components/__tests__/documentRecoveryAndIdempotency.test.ts`.

**Doc:** nota de correção em `auditorias/2026-08-29_fase-2-correcao-paridade-perfil-inteligente.md`
+ este relatório.

**Nada** em: banco, migrations, RLS, RPCs, provider/modelo/router/fallback de IA, prompts (texto),
schema `.sql`, `neuropsychologicalReport`/`learningProfile`/estética.

---

## 11. Fluxo financeiro — antes × depois

| Etapa | Antes | Depois |
|---|---|---|
| reserva | Gateway, antes do provider | igual |
| validação | só `JSON.parse` | `JSON.parse` → `sanitize` (determinístico) → `checkResultUsability` → **`validateStructuredResult`** (estrutura + placeholder + truncamento, por `requestType`) |
| commit | logo após o parse, **antes** de qualquer garantia de utilidade | após passar por **toda** a validação — resultado inutilizável **libera a reserva** e nunca commita |
| release | falha de provider/parse/timeout | + **falha de validação estrutural** (`UNUSABLE_RESULT`) |
| falha de `save()` no frontend | crédito consumido, documento perdido, erro genérico | crédito consumido (resultado **foi** entregue e validado), **documento preservado na tela**, **retry sem IA e sem nova cobrança** |
| duplo clique / retry de rede | só botão `disabled` | + `genLock` síncrono + `operationId` idempotente (reserve/commit/release dedup por `operation_id`) |
| reabrir / editar (manual) | não cobra | não cobra (inalterado) |

---

## 12. Roteiro manual (curto)

**Plano Regente** (Alunos → aluno → aba Plano de Ação Regente):
1. Escolher período → "Gerar novo plano · 6 créd." → o plano aparece **imediatamente** com
   **todos** os blocos: Objetivo Prático, Barreira Principal, 6 blocos core, Jogos/Vídeos/
   Materiais/Dinâmicas, Adaptações, Registro de Evidências, Resposta do Aluno, Próximo Passo.
2. Recarregar a aba → o plano salvo reabre **com os mesmos blocos** (antes vinham só 6).
3. "Imprimir / PDF" → Baixar PDF / Baixar Word / Abrir no Google Docs → conferir que Objetivo
   Prático, Barreira, Adaptações, Próximo Passo aparecem nos 3 formatos.
4. Simular falha de rede no `save` (devtools offline após a resposta da IA) → banner "não foi
   possível salvá-lo" + o plano visível → voltar online → "Tentar salvar novamente" → salva sem
   nova cobrança (conferir saldo de créditos inalterado entre o retry).
5. Duplo clique rápido em "Gerar" → 1 só plano, 1 só débito.

**Perfil Inteligente:**
6. Empty-state diz "Custo: 6 créditos"; botão "Atualizar com IA · 6 créd.".
7. Ter ≥ 2 versões → selecionar a V1 no histórico → "Atualizar com IA" → a nova versão é
   `max+1` (aparece como a mais recente), não duplica a V2.
8. Falha de `save` → o perfil completo fica na tela + "Tentar salvar novamente".

**Plano AEE:** regressão — gerar com PAEE presente → todos os blocos (incl. opcionais) persistem e
exportam como antes.

**Validação (requer ambiente com IA — NÃO executar agora):** um retorno com `[Nome do jogo]` em
bloco obrigatório ou com bloco core vazio → erro "Nao foi possivel identificar dados utilizaveis…
Nenhum credito foi consumido" e **saldo inalterado**.

---

## 13. Limitações que exigiriam migration (propostas — NÃO implementadas)

| # | Limitação | Proposta mínima |
|---|---|---|
| L-1 | **Recuperação após reload/fechar a aba** (§4): hoje o `pending` vive só na sessão. | Tabela `ai_pending_documents (tenant_id, student_id, doc_type, operation_id, payload jsonb, created_at, expires_at)` + endpoint de "reivindicar e salvar" que valida `operation_id` já commitado. OU reusar `deferCommit` do Gateway (reserva de 30 min) e persistir o `reservationId` no cliente. |
| L-2 | **Concorrência de versão do Perfil** (§6.3): 2 sessões → mesmo `max+1`. | Índice único `student_intelligent_profiles (student_id, version_number)` + retry no cliente ao violar; OU RPC `next_intelligent_profile_version(p_student_id)` como `next_action_plan_version`. |
| L-3 | **Idempotência entre dispositivos** (§5): `operationId` é por sessão. | Índice único / dedup por `(tenant_id, student_id, doc_type, content_hash)` numa janela curta. |
| L-4 | Comentário `content_json` do schema desatualizado (§2.3). | `COMMENT ON COLUMN … IS 'Blocos de ação do Plano Regente (6 obrigatórios + enriquecidos)'`. |

---

## Declarações finais

```
PLANO REGENTE PRESERVA TODOS OS CAMPOS: SIM
REABERTURA PRESERVA TODOS OS CAMPOS: SIM
PDF/WORD/GOOGLE DOCS RECEBEM OS MESMOS CAMPOS: SIM  (mesmo adaptador; Google Docs = mesmo Blob do Word — provado por sentinela no document.xml)
VALIDAÇÃO PRÉ-COMMIT DE CRÉDITOS: SIM  (_resultValidation.ts, entre parse e commit, só para os 3 requestType)
PLACEHOLDERS BLOQUEADOS: SIM  (sanitize remove; placeholder em campo obrigatório → bloco vazio → validate reprova → UNUSABLE_RESULT → release)
RETRY DE SAVE SEM NOVA IA: SIM  (persistPlan/persistProfile não referenciam AIService — verificado por teste)
RETRY DE SAVE SEM NOVA COBRANÇA: SIM  (não passa pelo Gateway — nenhuma reserva/commit)
OPERATION ID IMPLEMENTADO: SIM  (UUID por tentativa → callAIGateway → reserve/commit/release idempotentes por operation_id; + genLock síncrono)
ESCALA 1–5 CORRIGIDA: SIM  (_contextFormatter /10 → /5; valores no banco intactos)
CUSTO VISUAL CORRIGIDO: SIM  (literal "5 créditos" removido; usa AI_CREDIT_COSTS.PERFIL_INTELIGENTE = 6; custo agora também no botão "Atualizar com IA")
VERSÃO ANTIGA GERA NOVO MAX + 1: SIM  (nextProfileVersion — geração e edição manual)
LIMITE DE PROMPT IMPLEMENTADO: SIM  (clampPromptContext — cliente 15k + servidor 15k + salvaguarda rígida 32k; corta por seção, nunca no meio; log só de métricas)
PERFIL CLÍNICO ALTERADO: NÃO  (A-04 registrado como pendência — §7)
BANCO/MIGRATIONS ALTERADOS: NÃO  (content_json jsonb já aceitava as chaves; limitações que exigiriam migration em §13)
TESTES: PASS  (50 arquivos / 687 casos; +80 casos novos; baseline: 1 flake de ambiente preexistente, sem relação)
BUILD: PASS  (aviso de chunk >500 kB preexistente)
NOVOS ERROS TYPESCRIPT: NÃO  (55 → 55, conjunto idêntico confirmado por comm)
```

**Parado no relatório para revisão. Sem commit, push ou deploy.**
