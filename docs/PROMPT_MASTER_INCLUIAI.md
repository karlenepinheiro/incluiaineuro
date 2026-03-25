# PROMPT_MASTER_INCLUIAI.md
## Contexto completo do projeto IncluiAI

Este documento fornece contexto completo para qualquer IA que trabalhe neste repositório.

---

# SOBRE O SISTEMA

IncluiAI é uma plataforma SaaS de educação inclusiva que utiliza inteligência artificial para ajudar professores a criar e organizar documentos pedagógicos.

O sistema foi criado para reduzir burocracia e facilitar o trabalho docente.

---

# PROBLEMA QUE O SISTEMA RESOLVE

Professores gastam muitas horas criando manualmente:

Estudos de Caso  
PAEE  
PEI  
Relatórios  
Atividades adaptadas  

O IncluiAI automatiza esse processo.

---

# PRINCIPAL DIFERENCIAL

O sistema organiza o fluxo pedagógico completo:

Estudo de Caso  
→ PAEE  
→ PEI  
→ Atividades  
→ Evolução do aluno

Isso garante organização pedagógica e segurança documental.

---

# PÚBLICO ALVO

Professores  
Professores de AEE  
Coordenadores pedagógicos  
Escolas públicas e privadas

---

# FUNCIONALIDADES PRINCIPAIS

Cadastro de alunos  
Criação de estudos de caso  
Geração automática de PAEE  
Geração automática de PEI  
Criação de atividades adaptadas  
Registro de evolução do aluno  
Exportação de documentos em PDF  
Sistema de créditos para geração de IA

---

# TECNOLOGIAS UTILIZADAS

Frontend

React  
Typescript  
TailwindCSS  
Vite

Backend

Supabase

Banco

PostgreSQL

Storage

Supabase Storage

---

# ARQUITETURA

Sistema SaaS multi-tenant.

Cada escola possui:

tenant_id

Todos os dados devem estar vinculados a um tenant.

---

# SISTEMA DE PLANOS

FREE  
PRO  
MASTER  

Cada plano define:

quantidade de alunos  
quantidade de créditos  
acesso a recursos premium

---

# SISTEMA DE CRÉDITOS

Créditos são consumidos ao gerar:

PEI  
PAEE  
Atividades  
Relatórios

Claude deve sempre verificar créditos disponíveis.

---

# DOCUMENTOS GERADOS

Estudo de Caso  
PAEE  
PEI  
Atividades Adaptadas  
Relatórios

Todos devem conter:

data  
autor  
código de auditoria  
hash de validação

---

# OBJETIVO DO PRODUTO

Criar a principal plataforma de apoio à educação inclusiva do Brasil.

---

# COMO A IA DEVE TRABALHAR

Sempre agir como:

engenheiro de software sênior  
especialista em SaaS  
especialista em Supabase  
especialista em educação inclusiva

Sempre priorizar:

simplicidade  
segurança  
escalabilidade  
experiência do professor

---

# REGRAS IMPORTANTES

Nunca quebrar estrutura do banco  
Nunca remover auditoria  
Nunca permitir PEI sem estudo de caso  
Sempre considerar multi-tenant  
Sempre manter rastreabilidade de documentos