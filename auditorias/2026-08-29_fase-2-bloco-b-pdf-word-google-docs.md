# Fase 2 · Bloco B — PDF, Word e Google Docs nos demais documentos

**Data:** 29/08/2026 · Continuação da Fase 2 (Bloco A aprovado e preservado).
**Sem** commit / push / deploy / OAuth. **Sem** tocar prompts, IA, banco, schema, migrations, Gateway,
créditos, planos, autenticação, PDI, IncluiLAB.

Ressalva mantida: **`PDF E WORD POSSUEM O MESMO CONTEÚDO: PENDENTE DE COMPARAÇÃO VISUAL MANUAL`**
(estrutura verificada automaticamente; PDF não gerado fora do navegador).

---

## 1. Estado preservado

- `git status` / `git diff --stat` inspecionados. Worktree preexistente + Fase 1 + Fase 2 Bloco A: **tudo intacto**.
- **Bloco A preservado** — verificado por diff contra o checkpoint:
  `src/services/wordExportService.ts` e `src/services/PDFGenerator.ts` **idênticos** ao checkpoint pré-Bloco B
  (Bloco B não os tocou). `RelatorioPreview`, `FichasComplementaresView`, `ReportsView`, `QuickDocModal`,
  `documentModel/{sectionBuilders,relatorioTecnico,ficha,quickDoc,relatorioEvolucao}`,
  `useGoogleDocsExport`, `DocumentExportActions`, testes da Fase 2 — **inalterados**.
- `useFormalDocumentExport.ts` recebeu adição **retrocompatível** (`pdfFromSections?: boolean`;
  `onDownloadPdf` virou opcional) — os 4 chamadores do Bloco A continuam passando `onDownloadPdf`, comportamento idêntico.
- Nenhum `reset` / `checkout` / `restore` / `stash` / clean.

## 2. Checkpoint pré-Bloco B

| Item | Valor |
|---|---|
| Backup integral | `IncluiAI_Backups/incluiai_2_0_oficial_backup_20260828-142203/` — zip SHA256 `9b5701eb…` **reconferido, confere** |
| Snapshot Fase 2 (Bloco A) | `fase2_padronizar_exportacoes_pre_edicao_20260829-173846/` — **35/35 hashes reconferidos OK** |
| **Checkpoint Bloco B (novo)** | `IncluiAI_Backups/fase2_bloco_b_pre_edicao_20260829-183358/` |
| Conteúdo | 28 arquivos-fonte + `FILE-HASHES.txt` (SHA256) + `MANIFEST-SNAPSHOT.json` + `GIT-HEAD/STATUS/DIFF-STAT` + `FILE-HASHES-AFTER-EDIT.txt` |
| Backups anteriores | **não sobrescritos** |
| `.env` / tokens / secrets / dados reais | **não incluídos** |

## 3. Documentos concluídos (Bloco B)

| # | Documento | Fonte de dados | PDF | Word (.docx) | Google Docs | Onde |
|---|---|---|---|---|---|---|
| 1 | **Registro de Atendimento** | `ServiceRecord` (+ `dailyChecklist`) | **PDF real novo** (`generateFromSections` a partir do adaptador) — *substituiu uma chamada quebrada* (`ExportService.generateServiceRecordPDF`, que **não existia**) | ✅ | ✅ | `ServiceControlView` (linha expandida do registro) |
| 2 | **Matrícula** (Termo AEE, Declaração de Matrícula SRM, Declaração de Compromisso Familiar) | dados do aluno/escola + cláusulas legais fixas | real (`generateMatriculaDoc`, inalterado — reusado como handler) | ✅ | ✅ | `EnrollmentWizard` → passo Finalizar, por documento |
| 3 | **Perfil do Aluno (dossiê)** | cadastro do aluno + `config` (FichaConfigModal) + agregações | real (`generateStudentProfilePDF`, inalterado — **mesmo `config`**) | ✅ | ✅ | `StudentProfile` → botão "Gerar Dossiê" abre o painel |
| 4 | **Perfil Inteligente** | `IntelligentProfileJSON` da **versão selecionada** | real (`generateIntelligentProfilePDF` da versão atual, inalterado) | ✅ | ✅ | `IntelligentProfileTab` (barra de exportação) |
| 5 | **Plano de Ação — Professor Regente** | `ActionPlanJSON` | **PDF real novo** (`generateFromSections`) — *substituiu impressão de `innerHTML`* | ✅ | ✅ | `ActionPlanTab` → PrintModal ("Imprimir" HTML mantido separado) |
| 6 | **Plano de Ação — AEE** | `AEEActionPlanJSON` (blocos **próprios**, distintos do Regente) | **PDF real novo** — *substituiu impressão de `innerHTML`* | ✅ | ✅ | `AEEActionPlanTab` → PrintModal |
| 7 | **Checklist do Regente / Observação de Sala** | `ChecklistRegenteData` | **PDF real novo** — *substituiu impressão de `innerHTML`* ("Imprimir" HTML mantido) | ✅ | ✅ | `ChecklistRegenteForm` |
| 8 | **Checklist da Cuidadora** | `ChecklistCuidadoraData` | **PDF real novo** ("Imprimir" HTML mantido) | ✅ | ✅ | `ChecklistCuidadoraForm` |
| 9 | **Rotina da Cuidadora** | `CareSection[]` / `CareField[]` (`careRoutineService`) | **PDF real novo** — *antes não tinha NENHUMA exportação* | ✅ | ✅ | `CareRoutineTab` |
| 10 | **Biblioteca** (`StudentDocumentsPanel`) | `structured_data` **da versão salva** | **PDF real novo** (roteia p/ o renderer do tipo) — *substituiu `html2canvas` (imagem)* | ✅ | ✅ | por item da biblioteca |

**Regra canônica respeitada** em todos: o "Abrir no Google Docs" envia **exatamente** o Blob de
`exportGenericDocumentToWord(adaptador(dadosAtuais / versão salva))` — o mesmo do botão "Baixar Word (.docx)".
Nunca PDF, nunca HTML, nunca conteúdo reduzido, nunca IA, nunca créditos. Proteção de duplo clique,
reabertura da mesma cópia, confirmação após edição, reset ao trocar aluno/documento/versão, fallback
discreto, URL grande nunca aparece — tudo via `useGoogleDocsExport` (hook do Bloco A).

## 4. Documentos classificados como formulários internos

**Nenhum.** A auditoria confirmou que **Checklist do Regente** e **Checklist da Cuidadora** são
**documentos finais exportáveis** (tela própria com "Imprimir / PDF", salvos em `observation_forms`
com `audit_code`, entregues à equipe/família). Também alimentam a IA, mas o artefato existe — logo,
ganharam PDF + Word + Google Docs.

## 5. PDFs criados (canônicos, A4, diagramados)

PDF **real** novo (via `PDFGenerator.generateFromSections`, ramo genérico — capa + Seção I Identificação +
seções + assinatura + rodapé/paginação, sem `innerHTML`, sem página em branco) para: **Registro de
Atendimento, Plano de Ação Regente, Plano de Ação AEE, Checklist Regente, Checklist Cuidadora, Rotina
da Cuidadora, Biblioteca**. "Imprimir" (janela do navegador) permanece **separado** onde já existia.

Já tinham PDF real (inalterados, apenas reusados como handler): **Matrícula, Perfil do Aluno, Perfil Inteligente**.

## 6. Words criados

`.docx` OOXML real (MIME `…wordprocessingml.document`, zip válido, `document.xml` bem-formado, títulos
hierárquicos, **tabelas de verdade** `<w:tbl>`, listas, "Não informado") para os **10** documentos.
Adaptadores: `documentModel/{serviceRecord,actionPlan,checklist,careRoutine,intelligentProfile,studentProfile,matricula,biblioteca}.ts`.

## 7. Google Docs habilitado

Nos **10** — mesmo Blob DOCX, via `useFormalDocumentExport` → `useGoogleDocsExport`. Só aparece com
`VITE_GOOGLE_OAUTH_CLIENT_ID` configurado (fail-safe). Escopo `drive.file`, arquivo privado, token só em
memória, sem client secret, sem login Google no IncluiAI, sem compartilhamento público.

## 8. Tratamento da Biblioteca

`documentModel/biblioteca.ts` → `routeBibliotecaItem(item)`:
- lê **`item.structured_data`** (a versão salva) e **`item.audit_code`** — **nunca** dados atuais;
- identifica o tipo: `PEI`/`PAEE`/`Estudo de Caso`/`PDI`/`Unificado` → `canonicalDocumentType`;
  `RELATORIO_TECNICO` → adaptador do Relatório; demais → seções diretas ou "Conteúdo" bruto;
- atividade do IncluiLAB (`structured_data.activity`/`activityPackage` ou tipo "incluilab") → **sinalizada**,
  a linha mostra "exporte pelo próprio IncluiLAB" e **não** usa o renderer formal;
- `isolationKey` = `biblioteca:{tipo}:{aluno}:{audit_code}` → nunca mistura aluno/documento; troca de item reseta o Google Docs;
- documento salvo sem estrutura aproveitável → mensagem honesta, sem gerar arquivo corrompido;
- **não** cria um quarto formato; **não** reprocessa com IA; **não** consome créditos.
- **Não** altera banco / schema / migration / RLS.

## 9. Arquivos alterados

**Modificados no Bloco B (11):** `src/components/{ActionPlanTab,AEEActionPlanTab,CareRoutineTab,ChecklistCuidadoraForm,ChecklistRegenteForm,EnrollmentWizard,IntelligentProfileTab,StudentDocumentsPanel,StudentProfile}.tsx`,
`src/views/ServiceControlView.tsx`, `src/components/document-workspace/useFormalDocumentExport.ts` (adição retrocompatível).

**Novos — adaptadores (8):** `src/services/documentModel/{serviceRecord,actionPlan,checklist,careRoutine,intelligentProfile,studentProfile,matricula,biblioteca}.ts`.

**Novos — componentes de linha (8):** `src/components/fichas/{ServiceRecordExportRow,MatriculaExportRow,StudentProfileExportRow,IntelligentProfileExportRow,PlanoAcaoExportRow,ChecklistExportRow,CareRoutineExportRow,BibliotecaExportRow}.tsx`.

**Novos — testes (1):** `src/services/documentModel/__tests__/blocoB.adapters.test.ts` (+ `genericWordExport.test.ts` estendido com 3 casos Bloco B).

Hashes SHA256 pós-edição: `…/fase2_bloco_b_pre_edicao_20260829-183358/FILE-HASHES-AFTER-EDIT.txt`.
**Nada** em banco / migrations / RLS / Gateway / providers / prompts / PDI / IncluiLAB.

## 10. Testes

- **Suíte completa: PASS — 596/596** (43 arquivos). +21 casos no Bloco B.
- `blocoB.adapters.test.ts` (18) — **parametrizado**: cobertura explícita de campos (anti-regressão)
  para Registro de Atendimento e Perfil Inteligente; Regente ≠ AEE (blocos próprios); item concluído
  marcado (✔); checklists (cabeçalho + seções + item marcado); Rotina (text/checklist/scale/suggestions/rubric,
  `order_index`); Perfil do Aluno usa cadastro e **não** contém campos do Perfil Inteligente; Matrícula
  (3 tipos, referências legais + LGPD); Biblioteca (PEI→canônico, Relatório→adaptador, IncluiLAB→sinalizado,
  sem estrutura→não quebra).
- `genericWordExport.test.ts` (+3) — **ponta a ponta**: `.docx` válido de Registro de Atendimento,
  Plano de Ação AEE (blocos próprios) e Rotina da Cuidadora (tabela rubric + checklist só com itens marcados).
- **Verificado automaticamente:** estrutura das seções, ordem, `.docx` = zip OOXML válido, `document.xml`
  bem-formado, acentuação, tabelas, "Não informado".
- **Apenas inferido do código / roteiro manual:** layout visual do PDF, abrir de verdade no Word/LibreOffice,
  autorização + criação real no Google Drive, responsividade em tela. Nenhum navegador/Word/Drive disponível aqui.

## 11. TypeScript

- Baseline: **56 erros** preexistentes.
- Depois: **55 erros**. **0 erros novos.** A única diferença: o erro preexistente
  `src/views/ServiceControlView.tsx: error TS2339` (chamada a `ExportService.generateServiceRecordPDF`,
  método **inexistente**) **desapareceu** porque o Bloco B substituiu essa referência quebrada pelo
  novo fluxo de exportação. Correção de bug real, não regressão.
- Comparação exata por arquivo+código confirmada.
- **`TYPESCRIPT GLOBAL: FAIL — BASELINE PREEXISTENTE`** (55 erros preexistentes remanescentes; não declaro PASS).

## 12. Build

`npm run build` → **PASS** (`✓ built in ~18s`). Aviso de chunk >500 kB é **preexistente**.

## 13. Arquivos sintéticos (dados fictícios)

Gerados por script temporário (removido) via `exportGenericDocumentToWord` real — `.docx` OOXML validado,
`document.xml` bem-formado:

| Arquivo | Família | Seções esperadas |
|---|---|---|
| `05_registro-atendimento_SINTETICO.docx` | Registro | Dados do Atendimento · Observações do Atendimento · Ficha Avaliativa Diária (Desempenho/Interação como escala + Comportamento) · Progresso e Estratégias do Dia · Assinaturas |
| `06_matricula-termo-aee_SINTETICO.docx` | Matrícula | Identificação do Aluno · Termos e Condições (5 cláusulas) · Base Legal (CNE/CEB 4/2009, Decreto 7.611/2011, LBI, LDB, LGPD) · Assinaturas |
| `07_perfil-do-aluno_SINTETICO.docx` | Perfil | Identificação · Diagnóstico e Laudo · Perfil Pedagógico · Histórico Escolar · Contexto Sociofamiliar · Responsáveis e Contatos · Documentos e Protocolos (tabela) · Avaliações de Evolução (tabela) · Controle de Atendimentos (resumo) · Assinaturas |
| `08_perfil-inteligente_SINTETICO.docx` | Perfil | Identificação · Principais Mudanças · Quem sou eu (carta 1ª pessoa) · Parecer Neuropsicológico · Parecer Pedagógico (tabela de status) · Parecer Neuropedagógico (tabela) · Perfil de Aprendizagem · Potencialidades · Como Aprende Melhor · Pontos de Cuidado (Desafios + Pontos de atenção) · Atividades Recomendadas · O Que Observar · Próximos Passos · Fontes Consideradas |
| `09_plano-acao-regente_SINTETICO.docx` | Plano de Ação | Identificação · Objetivo Prático · Antes da Aula · Durante a Aula · Atividades e Estratégias · Avaliação · Pontos de Atenção · Comunicação com a Equipe · Próximo Passo |
| `10_plano-acao-aee_SINTETICO.docx` | Plano de Ação | Identificação · Objetivo da Sessão · Acolhida · Barreira Prioritária · Roteiro da Sessão · Materiais · Como Aplicar · Registro de Resposta |
| `11_rotina-da-cuidadora_SINTETICO.docx` | Escuta/Rotina | Chegada e Acolhida (texto + checklist só com itens marcados + escala) · Alimentação (chips selecionados + observação + tabela rubric) · Observações da Semana ("Não informado") |

**Pontos a conferir visualmente** (abrir no Word **e** no LibreOffice):
1. Cabeçalho: escola → título → Aluno(a) → Série/Turma → Escola → Data → Código.
2. Hierarquia: título de seção vs rótulo de campo vs texto.
3. Tabelas (`<w:tbl>`) com borda cinza e 1ª linha de cabeçalho — status de habilidades, rubric, escala de evolução, protocolos.
4. Listas: só os itens efetivamente marcados aparecem (checklists, planos).
5. "Não informado" onde o campo estava vazio.
6. Acentos (ã, ç, é, "–") corretos; documento **editável**; sem página em branco, sem campo cortado.
7. **Nenhum PDF sintético incluído** — o PDF exige o runtime do navegador; conferir na tela real (§15).

**Não enviei nada ao Google Drive.**

## 14. Limitações

1. **Bloco B não testado manualmente** — sem navegador/Word/Drive real. Estrutura verificada automaticamente.
2. **PDF sintético não gerado** — jsPDF exige runtime de navegador (fontes/canvas/QR). Onde há PDF novo
   (`generateFromSections`), o *pipeline* é o mesmo já validado do Estudo de Caso/PEI/PAEE (ramo genérico);
   a **diagramação real** dos 7 PDFs novos só pode ser conferida no navegador (§15). **Não afirmo equivalência visual.**
3. **Perfil Inteligente — PDF ≠ Word por design:** o PDF dedicado renderiza um subconjunto curado; o Word
   inclui **todos** os campos do JSON (`neuropsychologicalReport`, `learningProfile`, `nextSteps`,
   `sourcesConsidered`, `changesSinceLastVersion`). Registrado para a auditoria de prompt/estética.
4. **Matrícula — cláusulas duplicadas:** o texto legal fixo foi copiado do `PDFGenerator.generateMatriculaDoc`
   para o adaptador, com marcador `// MANTER EM SINCRONIA`. Não refatorei o renderer PDF (risco). Se o texto
   mudar num lado, precisa mudar no outro.
5. **Planos de Ação / Checklists — agrupamento visual:** o print HTML atual agrupa blocos sob rótulos
   ("Ações Principais", "Recursos e Estratégias"…). O PDF/Word canônico lista um bloco por seção, na mesma
   ordem. Perda só de agrupamento visual, não de conteúdo.
6. **Perfil do Aluno — agregações resumidas:** timeline, todas as fichas, atividades e laudos aparecem como
   **resumo/tabela** (contagens, listas), não item-a-item — igual à intenção do PDF do dossiê.
7. **Deduplicação Google Docs** só em memória/sessão (herdada do piloto). Nenhuma persistência criada.

## 15. Roteiro manual (Bloco B)

Pré-condição: `VITE_GOOGLE_OAUTH_CLIENT_ID` configurado (mesmo `.env` do piloto PAEE). Dados sintéticos.

Para **cada** documento (1–10):
1. Abrir a tela/fluxo indicado (§3) → a linha "Baixar PDF · Baixar Word (.docx) · Abrir no Google Docs
   [· Imprimir]" aparece **só com handlers reais**.
2. **Baixar PDF** → arquivo PDF real A4 (capa, Seção I Identificação, seções, assinatura, rodapé com código
   e "Página X de Y"). Não é a janela de impressão. Sem página em branco. Acentos OK.
3. **Imprimir** (onde existe) → segue abrindo a impressão do navegador, **separado** do "Baixar PDF".
4. **Baixar Word (.docx)** → abre no Word **e** no LibreOffice; títulos, tabelas, listas, "Não informado";
   editável; não é PDF/HTML renomeado; **todas** as seções na mesma ordem do PDF.
5. **Abrir no Google Docs** → `Conectando… → Preparando… → Enviando… → Documento criado — Abrir`; nova aba;
   editável; arquivo **privado** no Drive; nome `{Tipo} - {PrimeiroNome} - {Código}` (sem CID/diagnóstico);
   **sem URL grande** na tela.
6. Clicar de novo em "Documento criado — Abrir" → reabre a **mesma** cópia.
7. Duplo clique rápido no 1º envio → **1 só** arquivo no Drive.
8. Editar o documento (onde há edição) → clicar Google Docs → **`window.confirm`** antes de nova cópia.
9. Trocar de aluno / de documento / **de versão** (Perfil Inteligente) → botão volta a "Abrir no Google Docs"
   (nunca reaproveita o link anterior; aluno A não abre link do aluno B).
10. Cancelar popup OAuth → nenhum arquivo. Bloquear pop-ups → fallback "Não abriu? ↗".
11. `logout` do IncluiAI → próxima exportação pede consentimento.

Específico:
- **Perfil Inteligente:** abrir a **Versão 1** no seletor → exportar → o `.docx` deve trazer os dados da V1,
  não os da versão mais recente.
- **Biblioteca:** abrir um PEI salvo → o PDF/Word deve refletir o `structured_data` daquele registro; abrir
  outro registro → estado do Google Docs reseta.
- **Registro de Atendimento:** o ícone de download agora **abre o painel** de exportação da linha.
- **Rotina da Cuidadora:** o painel só aparece quando há ≥ 1 seção cadastrada.

## 16. Pendências registradas (para as próximas tarefas — **não corrigidas agora**)

- **Auditoria de prompt** (tarefa separada): Plano de Ação do Professor Regente; Plano de Ação AEE;
  Perfil Inteligente; Perfil Cognitivo (campo dentro do Relatório Completo). Para cada: prompt usado,
  schema esperado, campos recebidos, campos exibidos, campos exportados, divergências.
  - **Divergência já observada (Perfil Inteligente):** o `IntelligentProfileJSON` contém
    `neuropsychologicalReport`, `learningProfile`, `nextSteps`, `sourcesConsidered`, `changesSinceLastVersion`
    que **o PDF dedicado não renderiza**. O Word (Fase 2) inclui todos. A tela renderiza um subconjunto
    intermediário. Reconciliar na auditoria.
  - **Divergência (Planos de Ação):** blocos opcionais enriquecidos (`suggestedGames`, `focusPlan`, etc.)
    aparecem no print só quando presentes; o adaptador segue a mesma regra. Schema e prompt a auditar.
- **Reformulação estética dos documentos** (PDF e Word): larguras de tabela, sombreamento de cabeçalho,
  tipografia, capa, agrupamento visual dos blocos dos planos. Fora do escopo desta fase por instrução.
- **Matrícula:** extrair o texto das cláusulas para um módulo compartilhado consumido pelo PDF e pelo Word
  (hoje duplicado com marcador de sincronia).
- **Fast-follow** (auditoria de 26/08): `ensurePdfjsMapUpsertCompat()` também em `studentDocumentImportService.ts`.

---

## Checklist final

```
BLOCO A PRESERVADO: SIM
CHECKPOINT BLOCO B CRIADO: SIM
REGISTRO DE ATENDIMENTO PDF/WORD/GOOGLE DOCS: SIM / SIM / SIM
MATRÍCULA PDF/WORD/GOOGLE DOCS: SIM / SIM / SIM  (3 tipos: Termo AEE, Declaração Matrícula SRM, Declaração de Compromisso)
PERFIL DO ALUNO PDF/WORD/GOOGLE DOCS: SIM / SIM / SIM
PERFIL INTELIGENTE PDF/WORD/GOOGLE DOCS: SIM / SIM / SIM  (exporta a versão selecionada; Word inclui campos que o PDF omite — ver §14.3)
PLANO DE AÇÃO REGENTE PDF/WORD/GOOGLE DOCS: SIM / SIM / SIM  (PDF real substituiu impressão de innerHTML)
PLANO DE AÇÃO AEE PDF/WORD/GOOGLE DOCS: SIM / SIM / SIM  (blocos próprios, distintos do Regente)
ROTINA DA CUIDADORA PDF/WORD/GOOGLE DOCS: SIM / SIM / SIM  (antes sem nenhuma exportação)
CHECKLISTS CLASSIFICADOS CORRETAMENTE: SIM  (documentos finais exportáveis → Regente e Cuidadora ganharam PDF/Word/Google Docs)
BIBLIOTECA USA A VERSÃO SELECIONADA: SIM  (structured_data + audit_code do registro; nunca dados atuais; IncluiLAB preservado)
PDF E WORD POSSUEM O MESMO CONTEÚDO: PENDENTE DE COMPARAÇÃO VISUAL MANUAL
GOOGLE DOCS USA O WORD CANÔNICO: SIM
PROMPTS ALTERADOS: NÃO
PDI ALTERADO: NÃO
BANCO ALTERADO: NÃO
GATEWAY ALTERADO: NÃO
LOGIN GOOGLE REATIVADO: NÃO
IA USADA NA EXPORTAÇÃO: NÃO
CRÉDITOS CONSUMIDOS: NÃO
TESTES: PASS (596/596; +21 no Bloco B)
TYPESCRIPT GLOBAL: FAIL — BASELINE PREEXISTENTE (55 erros preexistentes; 0 novos; 1 bug preexistente corrigido)
NOVOS ERROS TYPESCRIPT: NÃO
BUILD: PASS
```

**Parado no relatório para sua revisão. Sem commit, push, deploy ou publicação OAuth.**
