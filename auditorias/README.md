# Auditorias — IncluiAI

## Regra Permanente do Projeto

> **Toda auditoria realizada no projeto IncluiAI deve gerar um relatório HTML dentro desta pasta,
> com nome no padrão `AAAA-MM-DD_motivo-da-auditoria.html`, e deve ser adicionada ao índice
> `auditorias/index.html`.**

Esta regra é permanente e se aplica a todos os tipos de auditoria:
técnica, funcional, visual, comercial, de banco de dados, segurança, assinatura,
créditos, Kiwify, UI/UX ou qualquer outra análise sistemática realizada no projeto.

---

## Convenção de Nomes

```
AAAA-MM-DD_motivo-da-auditoria.html
```

Regras obrigatórias:
- Usar a data no formato `AAAA-MM-DD` (ex: `2026-07-02`)
- Separar data do motivo com underscore `_`
- Usar letras minúsculas
- Usar hífen `-` entre palavras do motivo
- Não usar espaços
- Não usar acentos no nome do arquivo
- Extensão `.html`

**Exemplos válidos:**
```
2026-07-02_auditoria-cadastro-validacao-compra-kiwify-e-remocao-free.html
2026-08-15_auditoria-seguranca-rls-permissoes-supabase.html
2026-09-01_auditoria-billing-creditos-planos.html
2026-10-20_auditoria-ux-landing-page.html
```

---

## Estrutura Mínima do Relatório HTML

Cada relatório deve conter ao menos:

1. **Capa** — título, data, status, severidade principal
2. **Escopo** — o que foi analisado e o que não foi alterado
3. **Resumo executivo** — principais achados em 3–5 pontos
4. **Arquivos analisados** — caminhos, tipo, relevância
5. **Fluxo atual** — como o sistema funciona hoje
6. **Tabelas e funções** — estruturas de banco identificadas
7. **Divergências** — inconsistências encontradas
8. **Riscos** — classificados por severidade
9. **Casos de borda** — cenários limite e como o sistema os trata
10. **Recomendações** — o que deve ser feito e em que ordem
11. **Checklist** — itens a verificar antes de executar
12. **Conclusão** — resumo final
13. **Metadados de geração** — data/hora, responsável, confirmação de que nenhum arquivo funcional foi alterado

---

## Regras de Segurança

O relatório HTML **NÃO deve conter**:
- Senhas ou secrets
- Tokens de autenticação
- Chaves de API
- Payload completo com dados pessoais de clientes
- CPFs de clientes
- Dados financeiros individuais identificáveis

O relatório **PODE conter**:
- Caminhos de arquivos do projeto
- Nomes de funções e tabelas
- Trechos de código técnico sem dados sensíveis
- E-mails de seed já presentes no código-fonte (ex: `admin@incluiai.com`)
- Estrutura de tabelas e colunas (sem dados reais de clientes)

---

## Classificação de Severidade

| Classificação | Badge visual | Quando usar |
|--------------|-------------|-------------|
| **Crítica**  | 🔴 vermelho  | Falha de segurança, perda de dados, brecha comercial grave |
| **Alta**     | 🟡 laranja   | Inconsistência importante, risco de regressão, bug com impacto significativo |
| **Média**    | 🔵 azul      | Problema funcional limitado, divergência não crítica |
| **Baixa**    | 🟢 verde     | Melhoria de qualidade, alinhamento de boas práticas |

Estados de verificação:
- **Confirmado** — verificado diretamente no código ou banco
- **Pendente** — requer verificação adicional antes de agir
- **Não verificado** — informação não auditada nesta sessão

---

## Procedimento de Atualização do Índice

A cada nova auditoria criada:

1. Salvar o relatório HTML com o nome no padrão correto
2. Abrir `auditorias/index.html`
3. Adicionar um novo bloco `.audit-card` **no topo da lista** (mais recente primeiro)
4. Preencher: data, título, motivo, severidade principal, status, link para o arquivo

O índice deve sempre listar as auditorias da mais recente para a mais antiga.

---

## Índice Atual

| Data | Título | Status | Severidade |
|------|--------|--------|-----------|
| 08/07/2026 | Bloqueio Emergencial — Novas Contas FREE (Frontend) | ✅ Barreira confirmada, build ✅ | 🔴 Trigger DB pendente (Fase 0) |
| 08/07/2026 | Achado — tenants.plan_id não atualizado na ativação Kiwify | ✅ Investigação concluída | 🟡 Alta |
| 08/07/2026 | Achados — Fase 0 Diagnóstico Etapas A-D IncluiAI 2.0 | ✅ Diagnóstico A-D concluído | 🔴 1 trigger ativo confirmado |
| 08/07/2026 | Plano Técnico — Fase 0 Saneamento IncluiAI 2.0 | 📋 Plano pronto p/ execução | 🔴 Bloqueante |
| 07/07/2026 | Decisão Oficial — Planos, Créditos e Billing IncluiAI 2.0 | ✅ Documento base oficial | — |
| 07/07/2026 | Estratégia — Planos, Créditos e Roadmap IncluiAI 2.0 | 📋 Proposta p/ validação da CEO | 🟡 Alta |
| 02/07/2026 | Implementação — Validação de Compra antes do Cadastro | ✅ Concluída | Build ✅ |
| 02/07/2026 | Auditoria do Cadastro, Validação de Compra Kiwify e Remoção do Plano FREE | ✅ Concluída | 🔴 Crítica |

---

## Tipos de Auditoria Previstos

- **Técnica** — código, arquitetura, funções, triggers
- **Banco de dados** — schema, constraints, índices, RLS
- **Segurança** — permissões, exposição de dados, vulnerabilidades
- **Comercial** — billing, planos, créditos, Kiwify
- **Funcional** — fluxos de produto, casos de uso
- **UI/UX** — interfaces, textos, acessibilidade
- **Performance** — consultas lentas, cargas excessivas
- **Integração** — webhooks, APIs externas, Edge Functions
