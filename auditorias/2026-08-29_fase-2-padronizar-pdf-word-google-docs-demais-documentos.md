# Fase 2 — Padronizar PDF, Word e Google Docs nos demais documentos do IncluiAI

**Data:** 29/08/2026
**Escopo:** documentos formais que a Fase 1 deixou **sem Word canônico e sem Google Docs**.
**Entrega desta rodada:** auditoria completa + matriz + **BLOCO A implementado e testado**.
**BLOCO B:** auditado e planejado em detalhe — **parado para sua revisão do Bloco A antes de iniciar**
(exatamente como a instrução pede: "Conclua e teste o Bloco A antes de iniciar o Bloco B").
**Sem** commit / push / deploy / OAuth. **Sem** tocar prompts, IA, banco, Gateway, PDI, PAEE/PEI/EC/Unificado, IncluiLAB.

---

## 1. Estado recuperado

- `git status` / `git diff --stat`: worktree com ~5.760 linhas preexistentes (Fase 1 + piloto Google Docs +
  campo `sex` + IncluiLAB + gateway). **Tudo preservado.** Nenhum `reset/checkout/restore/stash/clean`.
- Branch `integracao/incluiai-2-0-oficial` @ `aa48ece`.
- Diffs dos exportadores inspecionados (RelatorioPreview, RelatorioViewer, exportService, PDFGenerator,
  FichasComplementaresView, QuickDocModal, ChecklistRegente/Cuidadora, IntelligentProfileTab, ActionPlanTab).

## 2. Backup e snapshot

| Item | Valor |
|---|---|
| Backup integral | `IncluiAI_Backups/incluiai_2_0_oficial_backup_20260828-142203/` — zip SHA256 `9b5701eb…` **reconferido, confere** |
| Snapshot Fase 1 | `expansao_exportacoes_pdf_word_gdocs_pre_edicao_20260829-155937/` — confirmado presente |
| **Snapshot Fase 2 (novo)** | `IncluiAI_Backups/fase2_padronizar_exportacoes_pre_edicao_20260829-173846/` |
| Conteúdo | 35 arquivos-fonte + `FILE-HASHES.txt` (SHA256) + `MANIFEST-SNAPSHOT.json` + `GIT-HEAD/STATUS/DIFF-STAT` + `FILE-HASHES-AFTER-EDIT.txt` |
| Backups anteriores | **não sobrescritos** |
| `.env` / tokens / secrets / dados reais | **não incluídos** |

## 3. Distinções de nomenclatura (esclarecido pelo código — **não** criei documentos duplicados)

### 3.1 "Perfil Inteligente" × "Perfil Cognitivo" × "Perfil do Aluno" — **3 nomes, 2 documentos + 1 campo**

| Nome | É documento? | Componente | Fonte de dados | PDF hoje |
|---|---|---|---|---|
| **Perfil Inteligente** | **SIM** — documento próprio, versionado, gerado por IA | `IntelligentProfileTab` | tabela `student_intelligent_profiles` · `IntelligentProfileJSON` (humanizedIntroduction, pedagogicalReport, neuroPedagogicalReport, neuropsychologicalReport, learningProfile, bestLearningStrategies, recommendedActivities, strengths, challenges, observationPoints, carePoints, nextSteps, firstPersonLetter) | `IntelligentProfilePDFDocument` (jsPDF dedicado) — **real** |
| **Perfil Cognitivo** | **NÃO é documento** | — | (a) *campo* `perfilCognitivo` dentro de `RelatorioCompleto`; (b) categoria de lacuna em `canonicalStudentContext` | não tem PDF próprio |
| **Perfil do Aluno** (dossiê) | **SIM** — documento próprio, **não** gerado por IA | `StudentProfile` | dados cadastrais do aluno + perfil pedagógico + profissionais + diagnóstico | `ExportService.generateStudentProfilePDF` (jsPDF) — **real** |
| "Perfil Pedagógico" | **NÃO é documento** | `PedagogicalProfileSection` | seção do formulário do aluno; alimenta o dossiê e a IA | — |

→ Fase 2 tratará **Perfil Inteligente** e **Perfil do Aluno** como dois documentos distintos (Bloco B).
"Perfil Cognitivo" não gera arquivo — sai dentro do Relatório Técnico.

### 3.2 "Relatório Técnico" × "Relatório para INSS" — **mesmo fluxo, `tipo` diferente**

`reportService.RelatorioSimples.tipo: 'simples' | 'inss'` e `RelatorioCompleto.tipo: 'completo'`.
**Uma única estrutura** `RelatorioResultado`; INSS é uma variação de modo (provavelmente prompt diferente,
fora do escopo desta tarefa). **Um único adaptador** cobre os três — sem documento duplicado.

### 3.3 Checklists — geram documento final?

- **Checklist do Regente / Observação de Sala** (`ChecklistRegenteForm`) e **Checklist da Cuidadora**
  (`ChecklistCuidadoraForm`): **SIM** — salvam em `observation_forms` com `audit_code` e produzem um
  artefato exportável ("Imprimir / PDF" via `window.open` + `innerHTML`). Também alimentam o contexto de IA.
- Além disso, **Observação do Professor Regente**, **Escuta da Família**, **Análise do AEE**,
  **Decisão Institucional**, **Acompanhamento/Evolução** são **fichas** (`FICHAS` em
  `FichasComplementaresView`) — mesmo formato `FichaTemplate.fields`, mesmo PDF genérico
  (`PDFGenerator.generateFicha`). **Uma família, um adaptador.**

### 3.4 Biblioteca — guarda documento completo ou referência?

- `documents` (Supabase) guarda `structured_data` (JSON completo) para Relatório Técnico e afins →
  reabertos por `handleOpenSavedRelatorio` / `readReportData` reconstruindo `RelatorioResultado`.
- `student_documents` / `StudentDocumentsPanel` (`PedagocicalDocument`) → `utils/pdfExport.exportDocumentToPDF`
  (html2canvas + jsPDF — **não canônico**, vira imagem).
- `observation_forms` (fichas/checklists) → guarda `fields_data` (JSON dos campos).
- **Conclusão:** a Biblioteca guarda o **conteúdo estruturado**, não só referência. Reabrir uma versão
  antiga já usa os dados daquela versão (`readReportData(record)`), sem misturar com o formulário atual.

## 4. Matriz completa dos documentos formais (evidência de código)

Legenda: **PDF real** = jsPDF verdadeiro (arquivo, MIME, cabeçalho/rodapé). **PDF impressão** = `window.print()`
sobre `innerHTML` (não é PDF diagramado — o navegador é quem "salva como PDF").

| Documento | Fonte dos dados | PDF atual | Word atual | Problema atual | Renderer necessário | Implementado (Fase 2) |
|---|---|---|---|---|---|---|
| **Relatório Técnico** (simples/inss/completo) | `RelatorioResultado` (IA + edição) / Biblioteca `documents` | **impressão** (`RelatorioPreview.handlePrint`, clone DOM) — *existia* `exportRelatorioAlunoPDF` jsPDF **não ligado à tela** | ❌ | "Exportar PDF" era impressão de HTML; sem Word; sem Google Docs | Adaptador → Word genérico canônico | **✅ BLOCO A** — PDF real ligado + Word + Google Docs |
| **Relatório Evolutivo** | `scores`/`observation`/`customFields`/`evolutions` (`ReportsView`) | **real** (`exportEvolutionReportPDF`, jsPDF + gráficos) | ❌ | Sem Word; sem Google Docs | Adaptador → Word genérico | **✅ BLOCO A** |
| **Fichas Complementares** (Observação do Regente, **Escuta da Família**, Análise do AEE, Decisão Institucional, Acompanhamento) | `FichaTemplate.fields` + valores / `observation_forms` | **real** (`PDFGenerator.generateFicha`) | ❌ | Sem Word; sem Google Docs | Adaptador `fichaToSections` (cobre a família) | **✅ BLOCO A** |
| **QuickDoc** (Encaminhamento, Convite de Reunião, Termo de Desligamento) | `filledData: Record<string,string>` (`QuickDocModal`) | **real** (`PDFGenerator.generate`) | ❌ | Sem Word; sem Google Docs | Adaptador `quickDocToSections` | **✅ BLOCO A** |
| **Perfil Inteligente** | `IntelligentProfileJSON` (`student_intelligent_profiles`) | **real** (`IntelligentProfilePDFDocument`) | ❌ | Sem Word; sem Google Docs | Adaptador estruturado próprio | ⏳ **BLOCO B** |
| **Perfil do Aluno (dossiê)** | cadastro do aluno (`StudentProfile`) | **real** (`generateStudentProfilePDF`) | ❌ | Sem Word; sem Google Docs | Adaptador estruturado próprio | ⏳ **BLOCO B** |
| **Plano de Ação (professor regente)** | `ActionPlanJSON` (IA) — `ActionPlanTab` | **impressão** (print de `ref.innerHTML`) | ❌ | Sem PDF diagramado; sem Word; sem Google Docs | PDF canônico **+** Word (adaptador) | ⏳ **BLOCO B** |
| **Plano de Ação AEE** | `ActionPlanJSON` (IA) — `AEEActionPlanTab` | **impressão** | ❌ | idem | idem | ⏳ **BLOCO B** |
| **Observação de Sala / Checklist Regente** | `fields_data` (`ChecklistRegenteForm`) | **impressão** (`buildChecklistPrintHtml`) | ❌ | idem | PDF canônico + Word | ⏳ **BLOCO B** |
| **Checklist da Cuidadora** | `fields_data` (`ChecklistCuidadoraForm`) | **impressão** (`buildCuidadoraPrintHtml`) | ❌ | idem | PDF canônico + Word | ⏳ **BLOCO B** |
| **Rotina da Cuidadora** | `CareSection[]`/`CareField[]` (`careRoutineService`) — `CareRoutineTab` | **nenhum** (sem botão de export) | ❌ | Sem PDF, sem Word, sem impressão | PDF + Word do zero | ⏳ **BLOCO B** |
| **Registro de Atendimento** | `record` (`ServiceControlView`) | **real** (`generateServiceRecordPDF`) | ❌ | Sem Word; sem Google Docs | Adaptador estruturado | ⏳ **BLOCO B** |
| **Matrícula** (Termo AEE, Declaração Matrícula SRM, Termo de Compromisso) | dados do aluno (`EnrollmentWizard`) | **real** (`generateMatriculaDoc`) | ❌ | Sem Word; sem Google Docs (documentos jurídicos — avaliar se Word é desejável) | Adaptador estruturado | ⏳ **BLOCO B** |
| **Biblioteca** (`StudentDocumentsPanel`) | `PedagocicalDocument` | `exportDocumentToPDF` (html2canvas → **imagem**) | ❌ | PDF é imagem de baixa fidelidade; sem Word | ver §10 | ⏳ **BLOCO B** |
| Modelos imprimíveis em branco (`blankPDFService`) | — | real | — | folha em branco — **não é documento concluído** | — | fora de escopo |

## 5. Componentes compartilhados criados (Fase 2)

Tudo **novo e aditivo** — nenhum renderer existente foi reescrito.

| Arquivo | Papel |
|---|---|
| `src/services/wordExportService.ts` (editado) | extraído `buildWordDocxBlob()` (núcleo de zip/estilos/rels, único ponto de montagem); novo `exportGenericDocumentToWord({ title, data, student, user, school, auditCode })` — **sem** `DocumentType` próprio, reusa 100% o renderer OOXML canônico; novo `buildGenericWordFilename()`; `fieldXml`/`coerceFields` passaram a respeitar `label:''` (bloco de texto corrido) e `type:'grid'` → `<w:tbl>` de verdade |
| `src/services/documentModel/sectionBuilders.ts` | blocos puros: `proseField` (vazio→"Não informado"; `optional`→some), `listField`, `gridField` (tabela real), `scaleField`, `kvField`, `section`/`buildSections`. 100% testável em `node` |
| `src/services/documentModel/relatorioTecnico.ts` | `RelatorioResultado` → `DocSection[]` (ordem = PDF canônico; cobre simples/inss/completo) |
| `src/services/documentModel/ficha.ts` | família de fichas → `DocSection[]` |
| `src/services/documentModel/quickDoc.ts` | 3 tipos QuickDoc → `DocSection[]` |
| `src/services/documentModel/relatorioEvolucao.ts` | escala/parecer/histórico → `DocSection[]` (gráficos viram tabela) |
| `src/components/document-workspace/useGoogleDocsExport.ts` | **hook** com toda a máquina de estados do "Abrir no Google Docs" (extraída do DocumentBuilder: dedupe, duplo-clique, confirmação após edição, reset ao trocar aluno/tipo, fallback discreto) |
| `src/components/document-workspace/DocumentExportActions.tsx` | **linha de botões reutilizável e leve** (Baixar PDF · Baixar Word · Abrir no Google Docs · Imprimir) — não altera a arquitetura visual da tela; botão só aparece com handler real |
| `src/components/document-workspace/useFormalDocumentExport.ts` | "cola": recebe adaptador + handler de PDF existente → devolve props prontas para `DocumentExportActions` (Word download + Google Docs usando o **mesmo Blob**) |
| `src/components/fichas/FichaExportRow.tsx`, `EvolutionExportRow.tsx` | wrappers (hook não pode rodar dentro de `.map()`) |

**Preservado:** `DocumentWorkspace` (Fase 1) intacto — só o comentário de cabeçalho.

## 6. BLOCO A — concluído

| Documento | PDF | Word (.docx) | Google Docs | Onde |
|---|---|---|---|---|
| Relatório Técnico | **agora PDF real** (`exportRelatorioAlunoPDF` jsPDF, ligado no lugar da impressão de HTML) — "Imprimir" continua separado | **✅ novo** (`exportGenericDocumentToWord` + `relatorioTecnicoToSections`) | **✅ novo** (mesmo Blob) | `RelatorioPreview` (barra de exportação abaixo da toolbar) |
| Relatório Evolutivo | real (inalterado) | **✅ novo** | **✅ novo** | `ReportsView` (cabeçalho) |
| Fichas (Escuta da Família, Observação do Regente, Análise AEE, Decisão Institucional, Acompanhamento) | real (`generateFicha`, inalterado) | **✅ novo** (`fichaToSections`) | **✅ novo** | `FichasComplementaresView` (cada card de ficha) |
| QuickDoc (Encaminhamento, Convite, Desligamento) | real (`generate`, inalterado) | **✅ novo** (`quickDocToSections`) | **✅ novo** | `QuickDocModal` (bloco de sucesso) |

**Regra canônica respeitada:** o Google Docs recebe **exatamente** o Blob de
`exportGenericDocumentToWord(adaptador(dadosAtuais))` — o mesmo do botão "Baixar Word (.docx)".
Nunca PDF, nunca HTML, nunca conteúdo reduzido, nunca IA, nunca créditos.
Proteção de duplo clique, reabertura da mesma cópia, confirmação após edição, reset ao trocar
aluno/documento, fallback discreto, URL grande nunca aparece — tudo herdado do hook.

## 7. BLOCO B — auditado, **não implementado** (aguardando sua revisão do Bloco A)

Ordem proposta (menor risco primeiro):

1. **Registro de Atendimento** + **Matrícula** — PDF real já existe; adaptador estruturado direto → Word + Google Docs. Baixo risco.
2. **Perfil do Aluno (dossiê)** — PDF real existe; adaptador do cadastro → Word + Google Docs.
3. **Perfil Inteligente** — PDF real existe; adaptador do `IntelligentProfileJSON` (muitos blocos) → Word + Google Docs.
4. **Plano de Ação (regente)** e **Plano de Ação AEE** — **substituir a impressão de `innerHTML` por PDF canônico** (`PDFGenerator` novo caso ou `generateFromSections`) + adaptador `ActionPlanJSON` → Word + Google Docs.
5. **Observação de Sala / Checklist Regente** e **Checklist Cuidadora** — idem (PDF canônico + Word).
6. **Rotina da Cuidadora** — PDF **e** Word do zero (`CareSection[]` → seções).
7. **Biblioteca** (`StudentDocumentsPanel`) — decidir: reusar o renderer do documento original em vez de `html2canvas`.

Cada item de Bloco B: adaptador dedicado (mesmos `sectionBuilders`), `<DocumentExportActions>` via
`useFormalDocumentExport`, testes parametrizados, sem tocar prompt/IA/dados.

## 8. Arquivos alterados

**Modificados (5, todos aditivos):** `src/services/wordExportService.ts`, `src/components/RelatorioPreview.tsx`,
`src/components/QuickDocModal.tsx`, `src/views/FichasComplementaresView.tsx`, `src/views/ReportsView.tsx`.
**Novos (13):** `src/services/documentModel/{sectionBuilders,relatorioTecnico,ficha,quickDoc,relatorioEvolucao}.ts`,
`src/components/document-workspace/{useGoogleDocsExport.ts,DocumentExportActions.tsx,useFormalDocumentExport.ts}`,
`src/components/fichas/{FichaExportRow,EvolutionExportRow}.tsx`,
`src/services/documentModel/__tests__/{sectionBuilders,adapters}.test.ts`, `src/services/__tests__/genericWordExport.test.ts`.
Hashes SHA256 em `…/fase2_padronizar_exportacoes_pre_edicao_20260829-173846/FILE-HASHES-AFTER-EDIT.txt`.
**Nada** em banco / migrations / RLS / Gateway / providers / prompts / IncluiLAB / PDI / PAEE/PEI/EC/Unificado.

## 9. Testes

- **Suíte completa: PASS — 575/575** (42 arquivos). +23 casos novos na Fase 2.
- Novos testes:
  - `sectionBuilders.test.ts` (9) — "Não informado", `optional`, multi-parágrafo single-line, listas, grid, filtragem.
  - `adapters.test.ts` (10) — **parametrizado por tipo/modo**: ordem canônica de seções do Relatório Técnico
    (simples/inss/completo), família de fichas, 3 tipos de QuickDoc, Relatório Evolutivo (tabela+média+histórico).
  - `genericWordExport.test.ts` (4) — **ponta a ponta**: `.docx` = zip OOXML válido (assinatura `PK`),
    MIME `…wordprocessingml.document`, todas as seções na ordem, acentuação preservada, `<w:tbl>` de verdade,
    "Não informado" no arquivo, `document.xml` bem-formado.
- Estrutura **verificada automaticamente**; layout visual e "abrir de verdade no Word/Google Docs" →
  **roteiro manual** (§12). Nenhum navegador/Word/Drive real disponível neste ambiente.

## 10. TypeScript

- Baseline: **56 erros** (todos preexistentes).
- Depois: **56 erros — mesmo conjunto**. As duas únicas linhas que "mudaram" no diff são erros
  **preexistentes** de `ReportsView.tsx` (props de `AudioEnhancedTextarea`) que apenas **deslocaram de linha
  739/748 → 750/759** por causa das 11 linhas inseridas do `<EvolutionExportRow>`. **0 erros novos.**
- **`TYPESCRIPT GLOBAL: FAIL — BASELINE PREEXISTENTE`** (comparação exata confirmada — não declaro PASS).

## 11. Build

`npm run build` → **PASS** (`✓ built in ~34s`). Aviso de chunk >500 kB é **preexistente**.

## 12. Arquivos sintéticos entregues (dados fictícios)

Gerados por script temporário (removido) rodando `exportGenericDocumentToWord` real — 4 `.docx`, zip OOXML
validado, `document.xml` bem-formado:

| Arquivo | Família | Seções esperadas |
|---|---|---|
| `01_relatorio-tecnico_SINTETICO.docx` | Relatório | Resumo Executivo · Identificação e Contexto · Histórico Relevante · Análise Pedagógica · Situação Funcional · Perfil Cognitivo e Funcional · Dificuldades · Potencialidades · Estratégias · Checklist de Áreas (tabela) · Evolução Observada · Observações Relevantes · Avaliação Multidimensional (tabela + média) · Conclusão · Recomendações Multidisciplinares · Assinaturas |
| `02_ficha-escuta-familia_SINTETICO.docx` | Ficha | Campos de Observação — Escuta da Família (Data · Responsável · Relato (2 parágrafos) · Preocupações · Acordos · Próximo Contato = "Não informado") · Assinaturas |
| `03_quickdoc-encaminhamento_SINTETICO.docx` | Plano/QuickDoc | Identificação do Encaminhamento (tabela K→V) · Justificativa · Orientações ao Serviço Receptor · Assinaturas |
| `04_relatorio-evolutivo_SINTETICO.docx` | Registro/Evolução | Avaliação Multidimensional (tabela 10 critérios + média) · Parecer Descritivo · Histórico de Avaliações (tabela 3 datas) · Assinaturas |

**Pontos a conferir visualmente** (abrir no Word **e** no LibreOffice):
1. Cabeçalho: escola → título → Aluno(a) → Série/Turma → Escola → Data → Código.
2. Hierarquia: título de seção (negrito maior) vs rótulo de campo (negrito menor) vs texto.
3. Tabelas com borda cinza, 1ª linha = cabeçalho.
4. "Não informado" onde o campo estava vazio.
5. Acentos (ã, ç, é, "–") corretos.
6. Sem página em branco, sem campo cortado, documento **editável**.
7. Nenhum PDF sintético incluído — o PDF é o **renderer canônico já existente** (jsPDF), que só roda no
   navegador; conferir na tela real pelo roteiro §13.

**Não enviei nada ao Google Drive.**

## 13. Roteiro manual (Bloco A)

Pré-condição: `VITE_DOCUMENT_WORKSPACE_ENABLED` não é necessária aqui; `VITE_GOOGLE_OAUTH_CLIENT_ID`
configurado (mesmo `.env` do piloto PAEE). Dados sintéticos.

**Relatório Técnico** (Relatórios → gerar/abrir um relatório):
1. Barra de exportação aparece abaixo da toolbar (petrol) num painel bege.
2. **Baixar PDF** → arquivo PDF real (cabeçalho corrente, rodapé com código, página X de Y). Não é a janela de impressão.
3. **Imprimir** → ainda abre a impressão do navegador (mantido separado, como pedido).
4. **Baixar Word (.docx)** → abre no Word e LibreOffice; títulos, tabelas (checklist/escala), listas, "Não informado", editável.
5. **Abrir no Google Docs** → `Conectando… → Preparando… → Enviando… → Documento criado — Abrir`; nova aba; editável; arquivo **privado** no Drive; nome `Relatorio Tecnico - <PrimeiroNome> - <Código>` (sem CID/diagnóstico); sem URL grande.
6. Editar um campo no painel "Editar" → salvar → clicar Google Docs → **pede confirmação** antes de nova cópia.
7. Clicar Google Docs de novo (sem editar) → reabre a **mesma** cópia.
8. Trocar de aluno / abrir outro relatório do histórico → botão volta a "Abrir no Google Docs".

**Fichas** (Fichas Complementares → expandir "Escuta da Família" etc.): preencher, **Salvar Ficha**, depois
Baixar PDF / Baixar Word / Abrir no Google Docs (mesma bateria 2–8). PDF = `generateFicha` canônico.

**QuickDoc** (ficha do aluno → documento rápido): preencher, **Gerar Documento** (PDF), depois no bloco verde
de sucesso: Baixar PDF / Baixar Word / Abrir no Google Docs.

**Relatório Evolutivo** (Relatórios → aba avaliativa): avaliar critérios, escrever parecer, depois no
cabeçalho: Baixar PDF (real, com gráficos) / Baixar Word (tabela) / Abrir no Google Docs / Imprimir.

Testar também: cancelar popup OAuth (nenhum arquivo), bloquear pop-ups (fallback "Não abriu? ↗"),
logout do IncluiAI (próxima exportação pede consentimento).

## 14. Limitações

1. **Bloco A não testado manualmente** (sem navegador/Word/Drive real aqui). Estrutura verificada
   automaticamente; abrir de verdade no Word e no Google Docs é o roteiro §13.
2. **PDF sintético não gerado** — jsPDF exige runtime de navegador (fontes, canvas, QR). O renderer PDF
   é o **pré-existente**, não alterado (exceto Relatório Técnico, que passou a **usar** o jsPDF que já existia
   em vez da impressão de HTML).
3. **Tabelas no Word** usam o estilo `TableGrid` simples (borda cinza). Suficiente para "não ser texto cru";
   o polimento estético (larguras, sombreamento de cabeçalho) fica para a auditoria de estética.
4. **Prosa multi-parágrafo**: quebras simples viram espaço; só quebra dupla vira novo parágrafo (necessário
   para o renderer rodar sem DOM). Sem perda de conteúdo, leve mudança de espaçamento vertical.
5. **Deduplicação Google Docs** só em memória/sessão (herdado do piloto) — recarregar a página perde o link.
   Nenhuma persistência criada.
6. **Bloco B inteiro pendente** — 8 documentos + a decisão da Biblioteca.

## 15. Pendências registradas (para as próximas tarefas — **não corrigidas agora**)

- **Auditoria de prompt** (tarefa separada, logo após esta): Plano de Ação do professor regente;
  Plano de Ação AEE; Perfil Inteligente; Perfil Cognitivo (o campo dentro do Relatório).
- **Reformulação estética dos documentos** (PDF e Word): larguras de tabela, sombreamento de cabeçalho,
  tipografia, capa. Fora do escopo desta fase por instrução explícita.
- **Fast-follow** já registrado na auditoria de 26/08: chamar `ensurePdfjsMapUpsertCompat()` também em
  `studentDocumentImportService.ts`.
- **Biblioteca / `StudentDocumentsPanel`**: trocar `html2canvas` (imagem) pelo renderer real do documento.

---

## Checklist final

```
BACKUP PRESERVADO: SIM
SNAPSHOT FASE 2 CRIADO: SIM
TODOS OS DOCUMENTOS AUDITADOS: SIM
RELATÓRIO TÉCNICO COM PDF REAL: SIM  (jsPDF canônico ligado no lugar da impressão de HTML)
RELATÓRIO TÉCNICO COM WORD REAL: SIM
RELATÓRIO TÉCNICO COM GOOGLE DOCS: SIM
PLANOS DE AÇÃO COM PDF REAL: NÃO  (Bloco B — hoje é impressão de innerHTML; QuickDoc/Encaminhamento já tem PDF real e Word)
PLANOS DE AÇÃO COM WORD REAL: PARCIAL  (QuickDoc: SIM; Plano de Ação regente/AEE: NÃO — Bloco B)
PLANOS DE AÇÃO COM GOOGLE DOCS: PARCIAL  (QuickDoc: SIM; Planos de Ação regente/AEE: NÃO — Bloco B)
PERFIS COM PDF REAL: SIM  (Perfil Inteligente e Perfil do Aluno já têm jsPDF real — inalterado)
PERFIS COM WORD REAL: NÃO  (Bloco B)
PERFIS COM GOOGLE DOCS: NÃO  (Bloco B)
FICHAS COM PDF REAL: SIM
FICHAS COM WORD REAL: SIM
FICHAS COM GOOGLE DOCS: SIM
ESCUTA E ROTINA COM PDF REAL: PARCIAL  (Escuta da Família: SIM — é ficha; Rotina da Cuidadora: NÃO — sem export hoje, Bloco B)
ESCUTA E ROTINA COM WORD REAL: PARCIAL  (Escuta da Família: SIM; Rotina da Cuidadora: NÃO — Bloco B)
ESCUTA E ROTINA COM GOOGLE DOCS: PARCIAL  (Escuta da Família: SIM; Rotina da Cuidadora: NÃO — Bloco B)
REGISTROS COM PDF REAL: SIM  (Relatório Evolutivo e Registro de Atendimento já têm jsPDF real)
REGISTROS COM WORD REAL: PARCIAL  (Relatório Evolutivo: SIM; Registro de Atendimento: NÃO — Bloco B)
REGISTROS COM GOOGLE DOCS: PARCIAL  (Relatório Evolutivo: SIM; Registro de Atendimento: NÃO — Bloco B)
PDF E WORD POSSUEM O MESMO CONTEÚDO: SIM  (mesma ordem de seções; diferenças só de formato)
GOOGLE DOCS USA O WORD CANÔNICO: SIM
LOGIN GOOGLE DO INCLUIAI REATIVADO: NÃO
SUPABASE AUTH ALTERADO: NÃO
IA USADA NA EXPORTAÇÃO: NÃO
CRÉDITOS CONSUMIDOS NA EXPORTAÇÃO: NÃO
BANCO ALTERADO: NÃO
GATEWAY ALTERADO: NÃO
PROMPTS ALTERADOS: NÃO
PDI ALTERADO: NÃO
INCLUILAB ALTERADO: NÃO
TESTES: PASS (575/575; +23 na Fase 2)
TYPESCRIPT GLOBAL: FAIL — BASELINE PREEXISTENTE (56 erros idênticos, 0 novos)
NOVOS ERROS TYPESCRIPT: NÃO
BUILD: PASS
```

**Parado no relatório para sua revisão do Bloco A. Sem commit, push, deploy ou OAuth.**
Ao aprovar, sigo para o Bloco B na ordem da §7.
