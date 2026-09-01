# Expansão Geral das Exportações — PDF + Word (.docx) + Google Docs

**Data:** 29/08/2026
**Escopo autorizado:** auditar todos os documentos do IncluiAI e generalizar a regra
"todo documento formal concluído oferece Baixar PDF + Baixar Word (.docx) + Abrir no
Google Docs + Imprimir", reaproveitando a integração já aprovada no piloto do PAEE.
**Sem** commit / push / deploy / publicação de OAuth. Parado no relatório para revisão.

---

## 1. Estado inicial recuperado

- `git status` / `git diff --stat`: worktree com ~5.700 linhas de alterações **preexistentes**
  (piloto Google Docs do PAEE, campo `sex`, IncluiLAB, gateway, etc.). **Tudo preservado** —
  nenhum `reset` / `checkout` / `restore` / `stash` / limpeza executado.
- Branch: `integracao/incluiai-2-0-oficial` @ `aa48ece`.
- Nenhum comando destrutivo. Nenhum arquivo não rastreado removido.

## 2. Backup e snapshot

| Item | Valor |
|---|---|
| Backup integral preexistente | `IncluiAI_Backups/incluiai_2_0_oficial_backup_20260828-142203/` |
| ZIP | `incluiai_2_0_oficial_source_backup.zip` (21.965.613 bytes, 516 arquivos) |
| SHA256 do ZIP | `9b5701ebffaa9d15f370997461a15ccbacc338d3437e9cb8a9dc8b886f737dcd` — **reconferido, confere** |
| Snapshot novo desta tarefa | `IncluiAI_Backups/expansao_exportacoes_pdf_word_gdocs_pre_edicao_20260829-155937/` |
| Conteúdo do snapshot | 25 arquivos-fonte candidatos a alteração + `FILE-HASHES.txt` (SHA256) + `MANIFEST-SNAPSHOT.json` + `GIT-HEAD/STATUS/DIFF-STAT/STASH` |
| Backups anteriores | **não sobrescritos** |
| `.env` / tokens / secrets / dados reais de aluno | **não incluídos** |
| Hashes pós-edição | `FILE-HASHES-AFTER-EDIT.txt` no mesmo snapshot |

## 3. Inventário completo (evidências de código)

### 3.1 Documentos formais que passam pelo `DocumentBuilder` (`usesPdfPreview`)

| Documento | Tela/componente | Conclui? | PDF | Word | Imprimir | Renderer PDF | Renderer Word | Google Docs | Situação |
|---|---|---|---|---|---|---|---|---|---|
| Estudo de Caso | `DocumentBuilder` + `FormalPdfPreview` | sim (`status FINAL`) | sim | sim | sim | `PDFGenerator.generateFromSections` | `wordExportService.exportDocumentToWord` (canônico OOXML) | **AGORA SIM** | Implementado nesta tarefa, aguardando teste manual |
| PEI | idem | sim | sim | sim | sim | `generateFromSections` | `exportDocumentToWord` | **AGORA SIM** | Implementado, aguardando teste manual |
| PAEE | `DocumentBuilder` + `FormalPdfPreview` + `DocumentWorkspace` | sim | sim | sim | sim | `generateFromSections` | `exportDocumentToWord` | SIM (piloto 27–28/08, testado manualmente) | Exportação já existente, **preservada** |
| PDI | `DocumentBuilder` + `FormalPdfPreview` | sim | sim | **AGORA SIM** | sim | `generateFromSections` | `exportDocumentToWord` (mesmo pipeline canônico; título "Plano de Desenvolvimento Individual (PDI)" adicionado) | **AGORA SIM** | Word + Google Docs implementados, **aguardando teste manual** |
| Plano Unificado PAEE + PEI (`DOCUMENTO_UNIFICADO_PEI_PAEE`) | idem | sim | sim | sim | sim | `generateFromSections` | `exportDocumentToWord` | **AGORA SIM** | Implementado, aguardando teste manual |
| Estudo de Caso / PEI / PAEE **(Externo)** | `DocumentBuilder` (upload de arquivo) | armazenamento de anexo | — | — | — | — | — | — | **Não é documento gerado** — arquivo externo anexado pela professora; fora do escopo |

Evidência: `src/components/DocumentBuilder.tsx` (`usesPdfPreview` L2258-2263, `canExportWord = isWordExportSupported(type)` L774, handlers `handleGeneratePDF` / `handleExportWord` / `handlePrint` / `handleOpenGoogleDocs` L2453-2516, `exportCurrentDocumentToGoogleDocs` com `generateDocxBlob: () => exportDocumentToWord({...})` L2417-2433); `src/services/wordExportService.ts` (`SUPPORTED_WORD_TYPES` L30-36).

### 3.2 Documentos formais **fora** do `DocumentBuilder` — hoje **sem renderer Word canônico**

| Documento | Tela/componente | Conclui? | PDF atual | Word atual | Imprimir atual | Renderer PDF | Renderer Word | Google Docs | Situação |
|---|---|---|---|---|---|---|---|---|---|
| Relatório Técnico (parecer) | `ReportsView` + `RelatorioPreview` / `RelatorioViewer` | sim — salvo em `documents` (`RELATORIO_TECNICO`, `DRAFT`) | sim | não | sim (`window.print()`) | `ExportService.exportRelatorioAlunoPDF` (jsPDF) + print de HTML | — | não | **Fase 2** — sem Word canônico |
| Relatório de Evolução / Acompanhamento | `ReportsView` | — | sim | não | sim | `ExportService.exportEvolutionReportPDF` (jsPDF + gráficos canvas) | — | não | **Fase 2** |
| Plano de Ação (professor de sala) | `ActionPlanTab` (dentro de `StudentProfile`) | sim (gerado por IA, `registrationNumber`) | "Baixar PDF" = **janela de impressão** de `ref.innerHTML` (professora salva como PDF pelo navegador) | não | sim (mesma janela) | HTML print — **não canônico** (sem cabeçalho/rodapé/QR/código de validação) | — | não | **Fase 2** |
| Plano de Ação AEE | `AEEActionPlanTab` | sim | idem (janela de impressão HTML) | não | sim | HTML print — não canônico | — | não | **Fase 2** |
| Perfil Inteligente (Cognitivo / Pedagógico) | `IntelligentProfileTab` | sim (histórico de versões) | sim | não | não | `generateIntelligentProfilePDF` → `IntelligentProfilePDFDocument` (jsPDF dedicado) | — | não | **Fase 2** |
| Perfil do Aluno (dossiê) | `StudentProfile` | — | sim | não | não | `ExportService.generateStudentProfilePDF` (jsPDF) | — | não | **Fase 2** |
| Fichas Complementares / Ficha de Acompanhamento | `FichasComplementaresView` | sim | sim | não | sim (`window.print()` em algumas) | `PDFGenerator.generateFicha` / `PDFGenerator.generate` (jsPDF) | — | não | **Fase 2** |
| Documento rápido / checklist dinâmico | `QuickDocModal` | sim | sim | não | não | `PDFGenerator.generate` (jsPDF) | — | não | **Fase 2** |
| Checklist Regente / Observação de Sala | `ChecklistRegenteForm` | sim (`audit_code`) | "Imprimir / PDF" = janela de impressão HTML | não | sim | HTML print — não canônico | — | não | **Fase 2** |
| Checklist Cuidadora | `ChecklistCuidadoraForm` | sim | janela de impressão HTML | não | sim | HTML print | — | não | **Fase 2** |
| Rotina da Cuidadora | `CareRoutineTab` + `careRoutineService` | sim (persistido) | — (sem botão de export dedicado localizado) | não | — | — | — | não | **Fase 2** — precisa de renderer PDF **e** Word |
| Escuta da Família | fluxo de formulários de observação (`ObservationFormService`) | sim | janela de impressão HTML | não | sim | HTML print | — | não | **Fase 2** |
| Documentos de Matrícula (Termo AEE, Declaração de Matrícula SRM, Termo de Compromisso) | `EnrollmentWizard` | sim | sim | não | não | `PDFGenerator.generateMatriculaDoc` (jsPDF) | — | não | **Fase 2** (documentos jurídicos — avaliar se Word é desejável) |
| Registro de Atendimento | `ServiceControlView` | — | sim | não | não | `ExportService.generateServiceRecordPDF` (jsPDF) | — | não | **Fase 2** |
| Documentos pedagógicos salvos (biblioteca do aluno) | `StudentDocumentsPanel` | — | sim ("Baixar PDF Oficial") | não | não | `utils/pdfExport.exportDocumentToPDF` (html2canvas + jsPDF) | — | não | **Fase 2** |
| Modelos imprimíveis em branco | `PrintableTemplatesView` / `blankPDFService` | n/a (formulário vazio) | sim | não | — | jsPDF | — | não | **Não é documento concluído** — folha em branco; fora do escopo de Word/GDocs |

### 3.3 IncluiLAB (auditado à parte — **atividades pedagógicas, não documentos formais**)

| Modo | PDF | PNG | Word (.docx) | JSON |
|---|---|---|---|---|
| A4 Econômica / A4 Visual / Folha Pronta | sim (`exportAsPDF`, html2canvas) | sim (`exportAsPNG`) | — | sim (`exportActivityJson`) |
| Pipeline canônico (schema estruturado 2.0) | sim | sim | **sim** — `wordExportService.exportIncluiLabActivityToWord` (renderer OOXML **próprio**, dedicado a atividade/gabarito/guia; separado do renderer de documentos formais) | sim |

Evidência: `src/views/IncluiLabView.tsx` L32-37, L2710-2781, L3071-3072, L3279-3281.
**IncluiLAB não foi alterado nesta tarefa.**

## 4. Documentos que **já tinham PDF**

Todos os itens de 3.1 e 3.2 (todo documento formal já baixa/abre PDF de alguma forma). Ressalva:
Plano de Ação (sala e AEE), Checklist Regente, Checklist Cuidadora e Escuta da Família geram o
PDF por **janela de impressão do navegador sobre `innerHTML`**, não pelo pipeline canônico
(sem cabeçalho/rodapé/QR/código de validação). Não é regressão — é o estado atual, registrado aqui.

## 5. Documentos que **já tinham Word real**

Antes desta tarefa: **Estudo de Caso, PEI, PAEE, Plano Unificado PAEE + PEI**
(`wordExportService.exportDocumentToWord`, OOXML real — `.docx` que abre em Word e LibreOffice,
com títulos/tabelas/listas/quebras/assinaturas, editável, nunca um PDF renomeado).
IncluiLAB canônico já tinha `.docx` próprio.

## 6. Documentos que estavam **sem algum formato**

- **PDI**: tinha PDF + Imprimir, **não tinha Word** nem Google Docs. → corrigido nesta tarefa.
- **Estudo de Caso, PEI, Plano Unificado**: tinham PDF + Word + Imprimir, **não tinham Google Docs**
  (o piloto era exclusivo do PAEE). → corrigido nesta tarefa.
- Todos os documentos da seção 3.2: **sem Word canônico e sem Google Docs**. → **Fase 2**.

## 7. Documentos que **receberam Google Docs** nesta tarefa

Estudo de Caso, PEI, PDI, Plano Unificado PAEE + PEI (o PAEE já tinha).
Regra canônica respeitada: **o Google Docs recebe exatamente o mesmo Blob DOCX do botão
"Baixar Word (.docx)"** — `DocumentBuilder.handleOpenGoogleDocs` injeta
`generateDocxBlob: () => exportDocumentToWord({ docType: type, data: { sections }, ... })`,
a mesmíssima chamada de `handleExportWord`. Fluxo:
`dados atuais (sections) → exportDocumentToWord → Blob DOCX válido → upload multipart no Drive
(mimeType destino application/vnd.google-apps.document) → abertura em nova aba`.
Nenhum PDF enviado ao Google, nenhuma prévia A4 convertida em texto, nenhum HTML cru, nenhuma
IA, nenhum crédito, nenhuma duplicação da lógica de montagem do Word.

## 8. Documentos que **receberam Word/PDF** nesta tarefa

- **PDI recebeu Word canônico** — adicionado a `SUPPORTED_WORD_TYPES` + título próprio em
  `getDocumentTitle`. Reaproveita 100% o `documentXml` genérico já usado por PEI/PAEE
  (mesmo modelo de dados `DocSection[]`), **sem solução improvisada**.
- Nenhum renderer PDF novo (todos os documentos-alvo já tinham PDF canônico).

## 9. Componente compartilhado — criado ou reutilizado

**Reutilizado e consolidado** o `DocumentWorkspace` (`src/components/document-workspace/DocumentWorkspace.tsx`),
já aprovado no piloto. Ele **já era** a peça reutilizável: recebe handlers reais
(`onDownloadPdf`, `onDownloadWord`, `onOpenGoogleDocs`, `onPrint`) e um rótulo (`docLabel`),
e **não conhece regra específica** de PAEE/PEI/Estudo de Caso. A única parte específica do PAEE
vivia no *chamador* (`DocumentBuilder`), no predicado `shouldShowPaeeWorkspace('PAEE')`.

Mudança mínima: novo predicado puro `shouldShowFormalDocumentWorkspace(flag, docType, isEditing)`
+ constante `FORMAL_WORKSPACE_DOC_TYPES` (5 tipos) em `src/config/documentWorkspaceFlags.ts`.
`shouldShowPaeeWorkspace` foi **mantida intacta** (compatibilidade + testes do piloto).
Nenhuma lógica de exportação copiada para novos arquivos.

Padrão visual preservado: `Baixar PDF` · `Baixar Word (.docx)` · `Abrir no Google Docs` · `Imprimir`;
estados do Google Docs (`Conectando…` / `Preparando…` / `Enviando…` / `Documento criado — Abrir`);
fallback discreto `Não abriu? Abrir no Google Docs ↗`; nunca mostra a URL extensa; acessibilidade
por teclado, foco visível, painel recolhível, responsivo (tablet/celular), sem overflow horizontal,
ícone oficial do Google (`GoogleGIcon`) — tudo inalterado.

## 10. Fonte canônica do Blob por documento

| Documento | Fonte do Blob DOCX (download Word **e** Google Docs) |
|---|---|
| Estudo de Caso | `exportDocumentToWord({ docType: 'Estudo de Caso', data: { sections } })` |
| PEI | `exportDocumentToWord({ docType: 'PEI', data: { sections } })` |
| PAEE | `exportDocumentToWord({ docType: 'PAEE', data: { sections } })` |
| PDI | `exportDocumentToWord({ docType: 'PDI', data: { sections } })` |
| Plano Unificado | `exportDocumentToWord({ docType: 'Documento Unificado PEI + PAEE', data: { sections } })` |

Único ponto de montagem OOXML: `wordExportService.documentXml`. Google Docs = mesmo Blob,
via `exportCurrentDocumentToGoogleDocs({ generateDocxBlob, displayName })`.

## 11. Proteção contra duplicação

Preservada e **isolada por documento**, exatamente como no piloto (`DocumentBuilder` L2344-2452):

- 1º clique cria a cópia; cliques seguintes reabrem a mesma (`googleDocsResult` + `openGoogleDocLink`).
- Duplo clique: `googleDocsInFlightRef` (guard síncrono antes de qualquer `await`) → 1 só cópia.
- Link alternativo (`googleDocsFallbackUrl`) nunca faz upload — é um `<a href>`.
- Falha ao abrir a aba não repete upload.
- Trocar só a visualização não cria cópia nova.
- Editar o conteúdo → `currentGoogleDocsContentSignature` (JSON das `sections`) muda →
  `window.confirm('O documento foi alterado. Deseja criar uma nova cópia…')` antes de nova cópia.
- Trocar de aluno **ou** de documento → `useEffect` em `[selectedStudent?.id, currentAuditCode]`
  reseta todo o estado do Google Docs. Como o `auditCode` embute tipo + aluno, **PAEE não abre o
  link do PEI**, e **documento de um aluno não abre o link de outro**.
- Chave de isolamento efetiva: tenant (sessão) + aluno (`selectedStudent.id`) + tipo/versão
  (`currentAuditCode`) + assinatura do conteúdo. **Sem dado sensível na chave nem em log.**
- Limitação honesta preservada: deduplicação **só em memória**, só durante a sessão.
  **Nenhuma migration, nenhuma tabela, nenhum armazenamento persistente criado.**

## 12. Segurança e privacidade

- Integração 100% reaproveitada de `googleDriveExportService.ts` (Google Identity Services,
  "token model", escopo **`drive.file`**, upload multipart direto do navegador).
- Arquivo **privado por padrão** (o serviço nunca chama `permissions.create`).
- Token **só em memória** (variável de módulo); `clearGoogleDriveSession()` chamado no logout
  do IncluiAI (`App.tsx`). Nenhum refresh token, nenhum client secret no frontend, nenhuma
  tabela nova, nenhuma Edge Function.
- Token nunca em URL / log / erro / banco — sempre header `Authorization`.
- Nome do arquivo: `{TIPO} - {PRIMEIRO NOME} - {CÓDIGO}` (`buildGoogleDocsDisplayName`) —
  só o primeiro nome, **sem CID / diagnóstico / nome completo**. Coberto por teste.
- Nenhuma reativação de login Google no IncluiAI, nenhuma mudança em Supabase Auth / Kiwify /
  planos / créditos / cadastro / RLS / Gateway / providers.
- Popup cancelado não cria arquivo; falha de autorização não gera upload parcial;
  timeout de upload → erro distinto (`UPLOAD_TIMEOUT_UNKNOWN`), **nunca reenvia sozinho**.

## 13. Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/config/documentWorkspaceFlags.ts` | + `FORMAL_WORKSPACE_DOC_TYPES` (5 tipos) e `shouldShowFormalDocumentWorkspace()`. `shouldShowPaeeWorkspace()` inalterada. |
| `src/services/wordExportService.ts` | + `DocumentType.PDI` em `SUPPORTED_WORD_TYPES`; + título PDI em `getDocumentTitle`; textos de erro citam PDI. Renderer OOXML **inalterado**. |
| `src/components/DocumentBuilder.tsx` | `showPaeeWorkspace` → `showFormalWorkspace` (novo predicado); `docLabel` dinâmico (`workspaceDocLabel`); `fitToContainer` segue o novo flag; texto de alerta cita PDI. Handlers de PDF/Word/Print/GoogleDocs **inalterados** (já eram parametrizados por `type`). |
| `src/App.tsx` | Apenas comentários + o comentário do state `isPaeeWorkspaceActive` (nome do state mantido para diff mínimo). Comportamento idêntico. |
| `src/components/document-workspace/DocumentWorkspace.tsx` | Apenas comentário de cabeçalho (não é mais "só PAEE"). Código inalterado. |
| `src/config/__tests__/documentWorkspaceFlags.test.ts` | + 7 casos parametrizados para `shouldShowFormalDocumentWorkspace`. |
| `src/services/__tests__/documentExportCanonical.test.ts` | **novo** — 19 casos parametrizados (Word canônico por tipo, consistência workspace⇄Word, nome de arquivo sem dado sensível, Google Docs usa o Blob canônico sem IA/créditos). |

Nada em banco / migrations / RLS / Gateway / providers / IncluiLAB / prompts / dados de aluno.

## 14. Testes

- Suíte completa: **552/552 passando** (39 arquivos). +26 casos novos.
- Direcionados: `documentWorkspaceFlags` + `documentExportCanonical` + `googleDriveExportService`
  + `wordExportService.incluilab` → **96/96**.
- Parametrizados por tipo de documento, cobrindo dos 20 pontos exigidos os que são testáveis
  sem renderizar o componente React (o projeto não usa jsdom): #3 (Google Docs recebe o Blob do
  mesmo renderer Word), #4 (MIME DOCX → conversão para Google Docs), #5 (nome seguro), #7 (nenhuma
  IA), #8 (nenhum crédito), #9-#12 e #17-#18 já cobertos por `googleDriveExportService.test.ts`
  do piloto (duplo clique, reabertura, timeout, cancelamento OAuth, falha de upload).
  Itens #1/#2/#13/#14/#19/#20 dependem de render de UI → **roteiro manual** (seção 18).

## 15. TypeScript

- Baseline (antes): **56 erros** (`react-router-dom`, `Deno`, assinatura de `page.render()` etc. —
  todos preexistentes).
- Depois: **56 erros — idênticos** (`diff` do output ordenado = vazio). **0 erros novos.**
- **`TYPESCRIPT GLOBAL: FAIL — baseline preexistente`** (comparação confirmada, não é PASS global).

## 16. Build

`npm run build` → **PASS** (`✓ built in ~1m`). Aviso de chunk > 500 kB é **preexistente**
(mesmos chunks: IncluiLabView, aiGatewayService, pdf, jspdf), não é regressão.

## 17. Limitações

1. **PDI Word + Google Docs — não testado manualmente.** O renderer é o mesmo pipeline canônico
   de PEI/PAEE e o modelo de dados é idêntico (`DocSection[]`), mas o `.docx` do PDI ainda não
   foi aberto em Word/LibreOffice real. Classificado como *IMPLEMENTADO, AGUARDANDO TESTE MANUAL*.
2. **Estudo de Caso / PEI / Plano Unificado Google Docs — não testados manualmente** (só o PAEE
   foi validado pelo usuário). O caminho é o mesmo do PAEE, byte a byte, mas cada tipo precisa de
   um teste manual real (autorização + criação no Drive + edição).
3. **Deduplicação só em memória** (herdada do piloto): recarregar a página perde o link "já
   criado". Aceito por instrução — nenhuma persistência criada.
4. **~15 documentos da seção 3.2 sem Word canônico** — Google Docs **bloqueado** para eles até
   existir um renderer Word verdadeiro (Fase 2). Não foi criado botão sem função em nenhum lugar.
5. **Sem jsdom no ambiente de teste** → testes de clique de botão / render do `DocumentWorkspace`
   não são automatizáveis hoje; cobertos por roteiro manual.
6. Título interno do `.docx` do PDI sai como "PDI" (igual a PEI sair como "PEI") porque o
   `DocumentBuilder` passa `title = String(type)` — comportamento **consistente com os demais**,
   não alterado.

## 18. Roteiro manual por documento

Pré-condição comum: `VITE_DOCUMENT_WORKSPACE_ENABLED=true` **e** `VITE_GOOGLE_OAUTH_CLIENT_ID`
configurado (mesmo `.env` usado para validar o PAEE). Usar **dados sintéticos**.

Para **cada** um de {Estudo de Caso, PEI, PDI, Plano Unificado}:

1. Gerar/abrir o documento, concluir (status FINAL), entrar no modo de visualização →
   deve aparecer o painel lateral do `DocumentWorkspace` com os 4 botões.
2. **Baixar PDF** → abre/baixa; todas as seções; cabeçalho/rodapé/QR/código; sem página em branco;
   "Não informado" preservado onde aplicável.
3. **Baixar Word (.docx)** → abre no Word **e** no LibreOffice; títulos, tabelas, listas, quebras,
   assinaturas; editável; **não** é PDF renomeado.
4. **Abrir no Google Docs**: `Conectando…` → `Preparando…` → `Enviando…` → `Documento criado — Abrir`;
   abre em nova aba; conteúdo editável; **sem URL grande na tela**; arquivo **privado** no Drive
   (conferir em drive.google.com); nome = `{Tipo} - {PrimeiroNome} - {Código}` sem CID/diagnóstico.
5. Clicar **de novo** em "Documento criado — Abrir" → reabre a MESMA cópia (não cria outra).
6. Duplo clique rápido no 1º envio → **1 só** arquivo no Drive.
7. Editar um campo → botão volta a `Abrir no Google Docs`; ao clicar → `window.confirm` antes de
   criar nova cópia.
8. Trocar de aluno / trocar de tipo de documento → botão reseta para `Abrir no Google Docs`
   (nunca reaproveita o link anterior). Confirmar que **PAEE não abre link do PEI** e que
   **aluno A não abre link do aluno B**.
9. Cancelar o popup de consentimento OAuth → nenhum arquivo criado, mensagem clara.
10. Bloquear pop-ups → aparece o fallback discreto `Não abriu? Abrir no Google Docs ↗` (nunca
    "bloqueado" categórico).
11. Impressão e PDF continuam idênticos ao anterior (sem regressão).
12. `logout` do IncluiAI → próxima exportação exige novo consentimento (token limpo).

## 19. Pendências para publicação

1. **Teste manual real** dos 4 novos documentos (roteiro §18) + confirmação do PDI `.docx` em
   Word/LibreOffice.
2. **Configuração externa do Google Cloud** (já necessária para o piloto): app OAuth publicado /
   verificado, escopo `drive.file`, origens JS de produção, política de privacidade/termos.
   Enquanto o app estiver em "Testing", só contas de teste conseguem autorizar.
3. **Fase 2 (documentos sem Word canônico)** — proposta objetiva:
   - **Grupo A (reaproveitam `documentXml` genérico com pouco esforço):** Relatório Técnico,
     Fichas Complementares, Documento rápido (`QuickDocModal`) — todos já têm dados em forma de
     seções/campos ou markdown; criar um adaptador `→ DocSection[]` e ligar ao renderer existente.
   - **Grupo B (exigem renderer Word novo, layout próprio):** Perfil Inteligente, Plano de Ação
     (sala e AEE), Perfil do Aluno (dossiê), Checklists Regente/Cuidadora, Rotina da Cuidadora,
     Escuta da Família, Registro de Atendimento, Documentos de Matrícula. Priorizar por volume
     de uso. Cada um: renderer OOXML reaproveitando os helpers de `wordExportService`
     (`paragraph`, `simpleTableXml`, `stylesXml`), **sem** duplicar a orquestração de upload.
   - Para todo o Grupo A/B: assim que houver `.docx` canônico, ligar o mesmo `DocumentWorkspace`
     (a peça já é genérica) — Google Docs "de graça".
4. **`nice-to-have`:** chamar `ensurePdfjsMapUpsertCompat()` também em
   `studentDocumentImportService.ts` (fast-follow já registrado na auditoria de 26/08, não feito
   aqui por estar fora do escopo).

---

## Checklist final

```
AUDITORIA COMPLETA DOS DOCUMENTOS: SIM
TODOS OS DOCUMENTOS FORMAIS INVENTARIADOS: SIM
PDF DISPONÍVEL ONDE DEVIDO: SIM  (ressalva: Plano de Ação sala/AEE, Checklists e Escuta da
  Família geram PDF por janela de impressão do navegador, não pelo pipeline canônico)
WORD REAL DISPONÍVEL ONDE DEVIDO: PARCIAL — SIM para Estudo de Caso, PEI, PAEE, PDI e Plano
  Unificado; NÃO para os demais documentos formais (Fase 2, exigem renderer Word)
GOOGLE DOCS USA O WORD CANÔNICO: SIM
GOOGLE DOCS IMPLEMENTADO NO ESTUDO DE CASO: SIM (aguardando teste manual)
GOOGLE DOCS IMPLEMENTADO NO PAEE: SIM (piloto, testado manualmente pelo usuário)
GOOGLE DOCS IMPLEMENTADO NO PEI: SIM (aguardando teste manual)
GOOGLE DOCS IMPLEMENTADO NO PDI: SIM (aguardando teste manual; Word novo)
GOOGLE DOCS IMPLEMENTADO NO PLANO UNIFICADO: SIM (aguardando teste manual)
GOOGLE DOCS IMPLEMENTADO NOS RELATÓRIOS: NÃO (Fase 2 — sem renderer Word canônico)
ARQUIVOS PRIVADOS NO DRIVE: SIM
LOGIN GOOGLE DO INCLUIAI REATIVADO: NÃO
SUPABASE AUTH ALTERADO: NÃO
IA UTILIZADA NA EXPORTAÇÃO: NÃO
CRÉDITOS CONSUMIDOS NA EXPORTAÇÃO: NÃO
BANCO ALTERADO: NÃO
GATEWAY ALTERADO: NÃO
INCLUILAB PRESERVADO: SIM
TESTES: PASS (552/552; +26 novos)
TYPESCRIPT GLOBAL: FAIL — baseline preexistente (56 erros idênticos, 0 novos)
NOVOS ERROS TYPESCRIPT: NÃO
BUILD: PASS
```

**Sem commit, push, deploy ou publicação do OAuth. Parado no relatório para revisão.**
