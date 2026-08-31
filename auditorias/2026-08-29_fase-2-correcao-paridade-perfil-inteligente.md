# Fase 2 — Correção Final: Paridade de Conteúdo (tela / PDF / Word / Google Docs)

> **CORREÇÃO POSTERIOR (31/08/2026 — recontagem de paridade).**
> A contagem "SIM em 10/14 … PARCIAL em 3" desta auditoria está **errada por 1**:
> a frase "7 de adaptador único + Fichas + QuickDoc + Matrícula + Perfil
> Inteligente" soma **11**, não 10 (os 7 de adaptador único incluem a
> **Biblioteca / `StudentDocumentsPanel`**, que a matriz da §8 classifica como
> "Estrutural: SIM" mas o parágrafo "Resumo" e o checklist não contaram).
>
> **Contagem correta:**
> - Paridade **estrutural: 11/14 SIM + 3/14 PARCIAL** (parciais: Relatório
>   Técnico, Relatório Evolutivo, Perfil do Aluno).
> - Paridade **textual: 12/14 SIM + 2/14 PARCIAL**. A frase original
>   "PARIDADE TEXTUAL DOS DOCUMENTOS: SIM" é superafirmação:
>   - **Relatório Técnico** — o PDF dedicado publica o gráfico "Grau das
>     Dificuldades" (`graficoDificuldades`) que o Word e a tela não têm;
>   - **Perfil do Aluno (dossiê)** — o PDF lista timeline, fichas, atividades e
>     laudos **item a item**; o Word e o Google Docs **condensam** em contagens
>     e tabelas-resumo. É condensação de **conteúdo**, não só de formatação; a
>     paridade textual vale para o **núcleo cadastral**.
> - O 14º documento é a **Biblioteca (`StudentDocumentsPanel`)** — consta na
>   matriz da §8, agora explicitado no inventário.
>
> Ver `auditorias/2026-08-30_auditoria-prompts-planos-acao-e-perfis.md` §11 e
> `auditorias/2026-08-31_correcao-planos-acao-e-perfis.md` §8. Nenhum exportador
> foi reescrito nesta recontagem — apenas o diagnóstico.


**Data:** 29/08/2026 · Correção pontual do Perfil Inteligente + auditoria automática de paridade.
**Sem** commit / push / deploy / OAuth · **Sem** alterar prompts, schema da IA, banco, migrations, RLS,
Gateway, créditos, planos, login, Google Cloud, estética definitiva, PDI, IncluiLAB.

---

## 1. Estado preservado

- `git status` / `git diff --stat` inspecionados. Fase 1 + Fase 2 (Bloco A e Bloco B): **tudo intacto**.
- Verificado por diff contra o snapshot: **apenas 4 arquivos mudaram** nesta tarefa
  (`documentModel/intelligentProfile.ts`, `documentModel/relatorioTecnico.ts` e 2 arquivos de teste).
  Nenhum componente de tela, nenhum renderer de PDF, `wordExportService.ts` e `IntelligentProfilePDFDocument.ts`
  **não tocados**.
- Nenhum `reset` / `checkout` / `restore` / `stash` / clean. Nenhum commit/push/deploy.

## 2. Snapshot

| Item | Valor |
|---|---|
| Backup integral | `IncluiAI_Backups/incluiai_2_0_oficial_backup_20260828-142203/` — zip SHA256 `9b5701eb…` **reconferido, confere** |
| Snapshots anteriores | Fase 1, Bloco A, Bloco B — **preservados, não sobrescritos** |
| **Snapshot desta correção** | `IncluiAI_Backups/fase2_paridade_pre_edicao_20260829-201624/` — 22 arquivos + `FILE-HASHES.txt` + `FILE-HASHES-AFTER-EDIT.txt` + `MANIFEST-SNAPSHOT.json` + git state |
| `.env` / tokens / secrets / dados reais | não incluídos |

## 3. Classificação dos cinco campos do Perfil Inteligente

Rastreio: `IntelligentProfileJSON` → `IntelligentProfileService.getLatest/getVersions` (sem normalização
extra) → seletor de versão (`onSelect(v) => setProfile(v)`) → **tela final** (visualização de exibição em
`IntelligentProfileTab.tsx`, blocos "Quem sou eu?" → "Análise Multidisciplinar" → "Como Aprende Melhor /
Pontos de Cuidado" → "Atividades Indicadas" → "Pontos de Observação" → Assinaturas) → **PDF**
(`IntelligentProfilePDFDocument.ts`, `drawWhoAmI → ANÁLISE MULTIDISCIPLINAR → drawChipListCard(Potencialidades)
→ drawLearningAndCare → drawActivities → drawObservation → drawSignatures`) → **Word** (adaptador) → **Google
Docs** (mesmo Blob do Word).

| Campo | Categoria | No documento? | Motivo |
|---|---|---|---|
| **`neuropsychologicalReport`** | **Conteúdo de revisão não publicado** (tipo 2/5) | **NÃO** | Editável no painel de **revisão** (v2+), mas o **layout do documento final não possui a seção "Parecer Neuropsicológico"** — nem a tela impressa, nem o PDF dedicado a renderizam. Hoje não é publicado. Incluí-lo exige **adicionar uma seção ao documento final** = decisão de produto + auditoria de estética (fora do escopo). Registrado como pendência. |
| **`learningProfile`** | **Conteúdo de revisão não publicado** (tipo 2/5) | **NÃO** | Editável na revisão (v2+), ausente do documento final (tela + PDF). Conceitualmente sobreposto a "Como Aprende Melhor" (`bestLearningStrategies`). Hoje não é publicado. Pendência. |
| **`nextSteps`** | **Condicional** (tipo 5) | **SIM — condicional** | Usado **apenas como fallback** de "Potencialidades" quando `strengths` está vazio (`strengths ?? nextSteps`), exatamente como a tela (linha 804) e o PDF (linha 810). **Sem seção própria.** |
| **`sourcesConsidered`** | **Metadado de auditoria de geração** (tipo 3/6) | **NÃO** | Registra **quais fontes a IA considerou** ao gerar. Nome técnico, **nunca exibido na UI** (nem na revisão, nem no documento, nem no modal de versões). É dado de auditoria, não conteúdo pedagógico. |
| **`changesSinceLastVersion`** | **Metadado de changelog** (tipo 3) | **NÃO** | "Principais mudanças em relação à versão anterior" — auxílio ao navegar entre versões. **Nunca exibido na UI**. Não é conteúdo do documento. |

Também classificados (para não vazarem): `bestLearningStrategies.text` (a tela e o PDF usam só `.items`),
`recommendedActivities[].incluiLabPrompt` (prompt técnico interno), `humanizedIntroduction.title` (rótulo).

## 4. Fonte de verdade confirmada

**O documento final do Perfil Inteligente = a visualização de exibição em `IntelligentProfileTab.tsx`**
(a que tem "Assinaturas da Equipe Pedagógica" e "Documento pedagógico oficial gerado pelo sistema IncluiAI",
e que é o alvo da impressão). O PDF dedicado **já espelha exatamente** esses blocos. O **JSON bruto NÃO é
a fonte de verdade** — vários campos existem no JSON sem estarem no documento.

Seções canônicas (fonte única, exportada em código como `INTELLIGENT_PROFILE_DOC_SECTIONS`):

```
1. Identificação           5. Potencialidades          8. Atividades Indicadas
2. Quem sou eu?            6. Como Aprende Melhor        9. Pontos de Observação
3. Parecer Pedagógico       7. Pontos de Cuidado
4. Parecer Neuropedagógico
```

## 5. Causa da divergência

O adaptador do Bloco B (`intelligentProfileToSections`) foi construído a partir do **JSON bruto** —
mapeou "todos os campos conhecidos" **incluindo os que não fazem parte do documento final**. O PDF
dedicado e a tela impressa nunca renderizaram esses 5 campos. Resultado: Word e Google Docs publicavam
5 campos a mais que a tela e o PDF (2 conteúdos de revisão + 2 metadados internos + 1 usado só como
fallback com seção própria indevida).

## 6. Correção aplicada

`documentModel/intelligentProfile.ts` **reescrito**:
- produz **exatamente** as 9 seções do documento final, na ordem da tela/PDF;
- `neuropsychologicalReport`, `learningProfile`, `sourcesConsidered`, `changesSinceLastVersion`,
  `bestLearningStrategies.text`, `incluiLabPrompt` **removidos** — não entram em Word nem Google Docs;
- `nextSteps` e `carePoints` mantidos **apenas como fallback condicional** (`strengths ?? nextSteps`,
  `challenges ?? carePoints`), mesma regra da tela e do PDF — **sem seção própria**;
- exporta a **versão selecionada** (o `IntelligentProfileExportRow` recebe o `record` da versão atual;
  `isolationKey` inclui `record.id:record.version_number` → trocar de versão reseta o Google Docs);
- a classificação de cada campo (`INTELLIGENT_PROFILE_FIELD_CLASSIFICATION`) fica **em código**, com motivo,
  para o relatório e o teste.
- **PDF preservado** — `IntelligentProfilePDFDocument.ts` não foi tocado (já estava correto).

Nada foi retirado silenciosamente: os 4 campos não-publicados estão documentados aqui e no código, e
registrados como pendência de produto (§11).

## 7. Modelo compartilhado

O **adaptador `intelligentProfileToSections` é a fonte única** que alimenta Word e Google Docs.
Não existem mais três listas divergentes. Para o PDF (renderer dedicado, layout premium preservado), a
**paridade é garantida por teste**: `paridade.test.ts` verifica com **valores sentinela únicos por campo**
que todo conteúdo final aparece no `document.xml` do Word e que nenhum campo interno vaza — e que o PDF
não referencia nenhum dos campos internos (verificação estrutural do código-fonte do renderer).

## 8. Matriz de paridade — todos os 14 documentos da Fase 2

Legenda: **estrutural** = mesmas seções/ordem · **textual** = todo conteúdo final da tela chega ao arquivo ·
**visual** = aparência renderizada (só verificável no navegador).

| Documento | Seções da tela | Seções do PDF | Seções do Word | Google usa o mesmo Word | Divergências |
|---|---|---|---|:---:|---|
| **Relatório Técnico** | 16 blocos (RelatorioViewer) | dedicado (`exportRelatorioAlunoPDF`) | adaptador — **alinhado à tela** (escala logo após identificação; renomeado "Identificação do Aluno") | **SIM** | PDF pré-existente posiciona a escala mais ao fim e tem "Grau das Dificuldades" (de `graficoDificuldades`) que a **tela não mostra**; o Word segue a tela. `graficoDesempenho` não é publicado por nenhum. **Estrutural Word↔tela: SIM. PDF↔tela: quirk pré-existente.** Textual: SIM. |
| **Relatório Evolutivo** | escala + parecer + campos complementares | dedicado (radar/barras/linha + PARECER + campos) | adaptador (escala em **tabela** + parecer + campos + histórico em tabela) | **SIM** | Gráficos (PDF) ↔ tabela (Word) = **mesmos números**. Word tem "Histórico de Avaliações" (tabela) onde o PDF tem o gráfico de linha. **Textual: SIM. Visual: N/A (gráfico é visualização dos mesmos dados).** |
| **Fichas** (Escuta da Família, Obs. do Regente, Análise AEE, Decisão Institucional, Acompanhamento) | `FichaTemplate.fields` | `generateFicha` — itera os mesmos `fields[]` | adaptador — itera os mesmos `fields[]` | **SIM** | **Estrutural: SIM** (mesma fonte, mesma iteração). Textual: SIM. |
| **QuickDoc** (Encaminhamento, Convite, Desligamento) | `filledData` | `PDFGenerator.generate` (por tipo) | adaptador (por tipo) | **SIM** | PDF adiciona parágrafos formais fixos; Word adiciona bloco de assinaturas. **Estrutural (seções de dados): SIM.** Textual: SIM. |
| **Registro de Atendimento** | `ServiceRecord` + ficha diária | **mesmo adaptador** (`pdfFromSections`) | mesmo adaptador | **SIM** | **Estrutural: SIM por construção.** |
| **Matrícula** (3 tipos) | — (wizard) | `generateMatriculaDoc` | adaptador (cláusulas idênticas, marcador de sincronia) | **SIM** | **Estrutural + textual: SIM.** Cláusulas duplicadas em 2 lugares (pendência §11). |
| **Perfil do Aluno (dossiê)** | `config` (FichaConfigModal) + agregações | `generateStudentProfilePDF` (dedicado, ~40 sub-blocos, foto/gráficos/timeline item-a-item) | adaptador (core cadastral + agregações **resumidas** em tabelas) — **mesmo `config`** | **SIM** | PDF detalha item-a-item; Word resume. **Estrutural: PARCIAL. Textual (campos do cadastro): SIM.** |
| **Perfil Inteligente** | 9 blocos (documento final) | 9 blocos (`IntelligentProfilePDFDocument`) | **9 blocos (CORRIGIDO)** | **SIM** | **Estrutural: SIM (tela = PDF = Word).** 5 campos classificados: 2 não-publicados (revisão), 2 metadados internos, 1 fallback condicional. |
| **Plano de Ação Regente** | `ActionPlanJSON` | **mesmo adaptador** (`pdfFromSections`) | mesmo adaptador | **SIM** | **Estrutural: SIM.** (Print HTML agrupa blocos sob rótulos; o canônico lista um bloco por seção — perda só de agrupamento visual.) |
| **Plano de Ação AEE** | `AEEActionPlanJSON` (blocos próprios) | **mesmo adaptador** | mesmo adaptador | **SIM** | **Estrutural: SIM.** |
| **Checklist Regente / Observação de Sala** | `ChecklistRegenteData` | **mesmo adaptador** | mesmo adaptador | **SIM** | **Estrutural: SIM.** |
| **Checklist Cuidadora** | `ChecklistCuidadoraData` | **mesmo adaptador** | mesmo adaptador | **SIM** | **Estrutural: SIM.** |
| **Rotina da Cuidadora** | `CareSection[]` | **mesmo adaptador** | mesmo adaptador | **SIM** | **Estrutural: SIM.** |
| **Biblioteca** | `structured_data` da versão salva | **mesmo adaptador** (`routeBibliotecaItem` → seções) | mesmo adaptador | **SIM** | **Estrutural: SIM.** Atividades IncluiLAB: não usam renderer formal (preservado). |

**Resumo:** paridade **estrutural SIM** em 10 documentos (7 de adaptador único + Fichas + QuickDoc +
Matrícula + Perfil Inteligente); **PARCIAL** em 3 (Relatório Técnico, Relatório Evolutivo, Perfil do Aluno) —
PDFs dedicados **pré-existentes** com granularidade diferente, **mesmo conteúdo**. Paridade **textual SIM**
em todos. Paridade **visual: pendente de teste manual** (sem renderização de PDF neste ambiente).

## 9. Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/services/documentModel/intelligentProfile.ts` | **Reescrito**: 9 seções = documento final; removidos os campos não-publicados; `INTELLIGENT_PROFILE_DOC_SECTIONS` + `INTELLIGENT_PROFILE_FIELD_CLASSIFICATION` + `INTELLIGENT_PROFILE_INTERNAL_FIELDS` exportados. |
| `src/services/documentModel/relatorioTecnico.ts` | Ordem alinhada à tela: "Avaliação Multidimensional" logo após "Identificação do Aluno" (era ao fim); seção renomeada "Identificação e Contexto" → "Identificação do Aluno". |
| `src/services/documentModel/__tests__/blocoB.adapters.test.ts` | Testes do Perfil Inteligente reescritos (agora exigem **ausência** dos 5 campos + fallbacks). |
| `src/services/documentModel/__tests__/adapters.test.ts` | Ordem esperada do Relatório Técnico atualizada. |
| `src/services/documentModel/__tests__/paridade.test.ts` | **Novo** — auditoria de paridade com sentinelas. |

**Nenhuma** alteração em componentes de tela, renderers de PDF, `wordExportService.ts`, banco, Gateway, prompts.

## 10. Testes

- **Suíte completa: PASS — 611/611** (44 arquivos). +15 casos.
- `paridade.test.ts` (10):
  - seções do adaptador = `INTELLIGENT_PROFILE_DOC_SECTIONS`, na ordem;
  - **sentinela por campo final** → todo sentinel aparece no `document.xml` do Word;
  - **nenhum sentinel interno vaza** (`npsTextINTERNO`, `learningProfileINTERNO`, `sourcesConsideredINTERNO`,
    `changesSinceLastVersionINTERNO`, `blsTextINTERNO`, `actPromptINTERNO`, …);
  - a classificação declara motivo (> 20 chars) para cada campo não-publicado;
  - os 5 componentes de linha com adaptador único passam `pdfFromSections: true` (PDF e Word da mesma fonte);
  - `useFormalDocumentExport`: `pdfFromSections ? downloadPdfFromSections` + `generateFromSections` + `exportGenericDocumentToWord` + `generateDocxBlob` (Google Docs = mesmo Blob do Word).
- `blocoB.adapters.test.ts` — Perfil Inteligente: seções = documento final; conteúdo final presente;
  **metadados internos e nomes técnicos em inglês ausentes**; `nextSteps`/`carePoints` só como fallback;
  versão selecionada preservada; acentuação; listas; tabelas; campos vazios ("Não informado"); nenhuma IA; nenhum crédito.
- `genericWordExport.test.ts` — `.docx` ponta a ponta (zip OOXML válido, `document.xml` bem-formado).

## 11. TypeScript

- Baseline atual: **55 erros** (56 originais − 1 bug preexistente corrigido no Bloco B).
- Depois desta correção: **55 erros — mesmo conjunto**. **0 erros novos.**
- **`TYPESCRIPT GLOBAL: FAIL — BASELINE PREEXISTENTE`** (55 preexistentes; não declaro PASS).

## 12. Build

`npm run build` → **PASS** (`✓ built in ~42s`). Aviso de chunk >500 kB é **preexistente**.

## 13. Limitações

1. **Paridade visual não verificável aqui** — sem navegador/Word/Drive real. A estrutural e a textual são
   verificadas automaticamente (sentinelas + `.docx` real).
2. **`neuropsychologicalReport` e `learningProfile`** ficaram **fora** do documento final (Word e PDF) porque
   o layout do documento final não os contempla hoje. **Não é perda de dado** (continuam no JSON, editáveis
   na revisão), mas é uma **decisão de produto pendente**: se devem passar a ser publicados, é preciso
   primeiro adicioná-los ao documento final (tela + PDF) — auditoria de estética/produto.
3. **Relatório Técnico / Evolutivo / Perfil do Aluno**: paridade estrutural **PARCIAL** — os PDFs dedicados
   pré-existentes têm granularidade maior (item-a-item, gráficos). O Word tem o mesmo **conteúdo**, resumido/
   tabelado. Unificar exigiria reescrever esses PDFs (fora do escopo — "não faça a reformulação estética").
4. **Matrícula** — cláusulas legais duplicadas (PDF + adaptador) com marcador `// MANTER EM SINCRONIA`.
5. **Flake do runner de testes** — o `vitest` desta máquina, sob carga, às vezes aborta a inicialização
   dos workers ("Cannot read properties of undefined (reading 'config')") reportando "44 failed / no tests".
   **Não é falha de teste**: limpar `node_modules/.vite` ou rodar com `--no-file-parallelism` dá **611/611
   passando** de forma reprodutível.

## 14. Roteiro manual — Perfil Inteligente (comparação lado a lado)

Pré-condição: `VITE_GOOGLE_OAUTH_CLIENT_ID` configurado. Dados sintéticos (arquivo
`12_perfil-inteligente-PARIDADE_SINTETICO.docx` + `12_..._SECOES.txt` anexos).

Seções esperadas (todos os formatos):
```
1. Identificação      4. Parecer Neuropedagógico   7. Pontos de Cuidado
2. Quem sou eu?        5. Potencialidades           8. Atividades Indicadas
3. Parecer Pedagógico   6. Como Aprende Melhor        9. Pontos de Observação
```

**Gerar o PDF pela interface:**
1. Alunos → abrir um aluno → aba **Perfil Inteligente** → gerar (ou abrir) um perfil.
2. Se houver mais de uma versão, no seletor de **Versões** escolher a **Versão 1**.
3. Clicar **Baixar PDF** (na barra de exportação). Confere: 9 seções acima, na ordem; carta em 1ª pessoa
   em "Quem sou eu?"; tabelas "Status de Habilidades" e "Status Cognitivo"; **sem** "Parecer Neuropsicológico",
   **sem** "Perfil de Aprendizagem", **sem** "Próximos Passos" como seção própria, **sem** "Fontes
   Consideradas", **sem** nomes técnicos em inglês.

**Abrir no Google Docs:**
4. Clicar **Abrir no Google Docs** → `Conectando… → Preparando… → Enviando… → Documento criado — Abrir` →
   nova aba, editável, arquivo **privado** no Drive, nome `Perfil Inteligente V1 - <PrimeiroNome> - <Código>`.
5. Clicar de novo → reabre a **mesma** cópia. Trocar para a Versão 2 → botão reseta; nova exportação = V2.

**Comparação lado a lado (o que eu, revisor, devo conferir):**
| # | tela final | PDF | Word | Google Docs |
|---|---|---|---|---|
| 1 | as 9 seções aparecem, na ordem | idem | idem | idem |
| 2 | "Quem sou eu?" = carta em 1ª pessoa (ou introdução) | idem | idem | idem |
| 3 | Pareceres Pedagógico e Neuropedagógico com status | idem | tabelas | tabelas |
| 4 | Potencialidades = `strengths` (ou `nextSteps` se vazio) | idem | idem | idem |
| 5 | Pontos de Cuidado = `challenges` (ou `carePoints` se vazio) | idem | idem | idem |
| 6 | **NÃO** há "Parecer Neuropsicológico" / "Perfil de Aprendizagem" / "Fontes Consideradas" | idem | idem | idem |
| 7 | rodapé: Versão, Código de Registro, Data, Emitido por | idem | Identificação | Identificação |

Se algum item da tela não aparecer no PDF/Word/Google Docs (ou vice-versa), **é divergência** — reportar.

---

## Checklist final

```
DIVERGÊNCIA DO PERFIL INTELIGENTE CORRIGIDA: SIM
CAMPOS FINAIS PRESENTES NA TELA: SIM
CAMPOS FINAIS PRESENTES NO PDF: SIM  (o PDF dedicado já renderizava as 9 seções finais; inalterado)
CAMPOS FINAIS PRESENTES NO WORD: SIM  (adaptador reescrito = 9 seções finais)
GOOGLE DOCS USA O MESMO WORD: SIM
METADADOS INTERNOS EXPOSTOS: NÃO  (neuropsychologicalReport, learningProfile, sourcesConsidered, changesSinceLastVersion, incluiLabPrompt, bestLearningStrategies.text — removidos do Word/Google Docs; verificado por teste de sentinela)
VERSÃO SELECIONADA PRESERVADA: SIM  (exporta record.profile_json da versão escolhida; isolationKey inclui id+version_number)
PARIDADE ESTRUTURAL DOS DOCUMENTOS: PARCIAL  (SIM em 10/14 — 7 de adaptador único + Fichas + QuickDoc + Matrícula + Perfil Inteligente; PARCIAL em Relatório Técnico, Relatório Evolutivo e Perfil do Aluno — PDFs dedicados pré-existentes, mesmo conteúdo, granularidade diferente)
PARIDADE TEXTUAL DOS DOCUMENTOS: SIM  (todo conteúdo final da tela chega ao Word e ao Google Docs)
PARIDADE VISUAL DOS DOCUMENTOS: PENDENTE DE TESTE MANUAL  (sem renderização de PDF neste ambiente)
PROMPTS ALTERADOS: NÃO
BANCO ALTERADO: NÃO
GATEWAY ALTERADO: NÃO
IA UTILIZADA NA EXPORTAÇÃO: NÃO
CRÉDITOS CONSUMIDOS: NÃO
TESTES: PASS (611/611; +15)
TYPESCRIPT GLOBAL: FAIL — BASELINE PREEXISTENTE (55; 0 novos)
NOVOS ERROS TYPESCRIPT: NÃO
BUILD: PASS
```

**Parado no relatório para sua revisão. Sem commit, push ou deploy.**
