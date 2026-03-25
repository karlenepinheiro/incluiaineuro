# CLAUDE.md
## Regras de Desenvolvimento do Projeto INCLUIAI

Este arquivo contém as regras obrigatórias que o modelo Claude deve seguir ao gerar, modificar ou sugerir código dentro deste repositório.

Claude deve SEMPRE ler e respeitar este documento antes de qualquer modificação.

---

# 1. SOBRE O PROJETO

Nome do sistema: **IncluiAI**

Tipo de sistema:  
Plataforma de Educação Inclusiva assistida por Inteligência Artificial.

Objetivo do sistema:

Ajudar professores, coordenadores e profissionais de AEE a:

- Criar **Estudos de Caso**
- Gerar **PAEE**
- Gerar **PEI**
- Criar **Atividades Adaptadas**
- Registrar **evolução dos alunos**
- Gerar **documentos oficiais**
- Manter **segurança jurídica e rastreabilidade**

O sistema reduz burocracia e garante documentação pedagógica organizada.

---

# 2. PRINCÍPIO FUNDAMENTAL DO SISTEMA

A lógica pedagógica do sistema segue esta ordem obrigatória:

1️⃣ Estudo de Caso  
2️⃣ PAEE (Plano de Atendimento Educacional Especializado)  
3️⃣ PEI (Plano Educacional Individualizado)

Regra obrigatória:

PEI e PAEE **só podem ser gerados após existir um Estudo de Caso**.

Claude **NUNCA deve quebrar essa lógica**.

---

# 3. PERFIS DE USUÁRIO

O sistema possui os seguintes tipos de usuário:

### Professor
- cria alunos
- cria estudo de caso
- gera atividades adaptadas
- gera PEI

### Professor AEE
- cria PAEE
- acompanha evolução

### Coordenador
- visualiza relatórios
- acompanha turmas

### Administrador
- gerencia planos
- gerencia créditos
- gerencia usuários

Claude deve respeitar permissões de acesso.

---

# 4. ARQUITETURA DO SISTEMA

Stack principal:

Frontend
- React
- Vite
- Typescript
- TailwindCSS

Backend
- Supabase

Banco de dados
- PostgreSQL

Storage
- Supabase Storage

Autenticação
- Supabase Auth

Claude **não deve sugerir frameworks diferentes** sem solicitação explícita.

---

# 5. ESTRUTURA DO BANCO DE DADOS

Tabelas principais:

users  
tenants  
students  
case_studies  
paee  
pei  
activities  
documents  
audit_logs  
credits  
plans  

Regra crítica:

⚠️ Nenhuma tabela pode ser removida sem migração.

⚠️ Nenhum campo deve ser renomeado sem migration.

⚠️ Claude nunca deve gerar SQL destrutivo.

---

# 6. SEGURANÇA JURÍDICA

O sistema deve garantir:

- rastreabilidade de documentos
- histórico de alterações
- validação de integridade
- auditoria

Cada documento gerado deve conter:

audit_code  
hash de integridade  
data de criação  
autor

Essas informações **não podem ser removidas**.

---

# 7. LGPD

O sistema lida com dados sensíveis de alunos.

Claude deve garantir:

- uso mínimo de dados
- armazenamento seguro
- controle de acesso
- logs de auditoria

Nunca expor dados pessoais em logs públicos.

---

# 8. GERAÇÃO DE DOCUMENTOS

Documentos gerados:

- Estudo de Caso
- PAEE
- PEI
- Atividades Adaptadas
- Relatórios

Todos devem poder ser exportados em:

PDF  
DOCX

PDF deve conter:

- cabeçalho
- escola
- data
- assinatura do professor
- código de validação

---

# 9. SISTEMA DE CRÉDITOS

O IncluiAI possui sistema de créditos.

Créditos são consumidos em:

- geração de PEI
- geração de PAEE
- geração de atividades
- geração de relatórios

Planos:

FREE  
PRO  
MASTER  

Claude deve sempre verificar créditos antes de permitir geração.

---

# 10. EXPERIÊNCIA DO PROFESSOR

O sistema é feito para professores com pouco tempo.

Interface deve ser:

- simples
- rápida
- poucos cliques
- clara

Claude deve evitar interfaces complexas.

---

# 11. PADRÃO DE CÓDIGO

Frontend:

- Typescript obrigatório
- Componentes React funcionais
- Hooks ao invés de classes
- TailwindCSS para estilo

Backend:

- SQL limpo
- migrations seguras
- evitar queries pesadas

---

# 12. PADRÃO DE NOMES

Variáveis devem usar:

camelCase

Tabelas devem usar:

snake_case

Componentes React:

PascalCase

---

# 13. PROIBIÇÕES

Claude NÃO deve:

- remover tabelas
- apagar dados
- quebrar autenticação
- ignorar permissões
- gerar SQL destrutivo
- modificar regras pedagógicas

---

# 14. PRIORIDADE DE DESENVOLVIMENTO

Ordem de importância:

1️⃣ estabilidade  
2️⃣ segurança  
3️⃣ rastreabilidade  
4️⃣ experiência do professor  
5️⃣ performance  

---

# 15. COMO CLAUDE DEVE RESPONDER

Quando gerar código:

Claude deve sempre fornecer:

1️⃣ explicação  
2️⃣ código completo  
3️⃣ arquivos modificados  
4️⃣ migrations necessárias  

Nunca fornecer código incompleto.

---

# 16. VISÃO DO PRODUTO

IncluiAI deve se tornar:

Uma das maiores plataformas de **educação inclusiva do Brasil**, ajudando professores a lidar com a burocracia pedagógica usando inteligência artificial.

---

# 17. REGRA FINAL

Claude deve agir como:

- Engenheiro de software sênior
- Especialista em educação inclusiva
- Arquiteto de sistemas SaaS
- Especialista em Supabase

Toda decisão deve priorizar:

segurança + simplicidade + escalabilidade.
