# AI_FEATURE_ROADMAP.md
## Roadmap oficial do produto IncluiAI

Este documento define as funcionalidades atuais e futuras da plataforma IncluiAI.

Claude e outras IAs devem usar este documento para entender o escopo do produto.

---

# VISÃO DO PRODUTO

IncluiAI é uma plataforma SaaS de educação inclusiva baseada em inteligência artificial que automatiza a criação de documentos pedagógicos e acompanhamento de alunos.

Objetivo:

reduzir burocracia docente  
melhorar organização pedagógica  
garantir segurança documental

---

# MÓDULOS PRINCIPAIS

## 1. Gestão de Alunos

Funcionalidades:

Cadastro de alunos  
Diagnóstico pedagógico  
Laudos médicos  
Observações pedagógicas  
Histórico escolar

Tabela principal:

students

---

# 2. Estudo de Caso

Primeiro documento do fluxo pedagógico.

Conteúdo:

dados do aluno  
histórico escolar  
dificuldades observadas  
potencialidades  
contexto familiar  
avaliação pedagógica

Tabela:

case_studies

Regra:

todo aluno deve possuir um estudo de caso antes de gerar PEI ou PAEE.

---

# 3. PAEE

Plano de Atendimento Educacional Especializado.

Conteúdo:

estratégias pedagógicas  
recursos de acessibilidade  
metodologias inclusivas  
cronograma de acompanhamento

Tabela:

paee

---

# 4. PEI

Plano Educacional Individualizado.

Conteúdo:

objetivos pedagógicos  
adaptações curriculares  
avaliação diferenciada  
estratégias de ensino

Tabela:

pei

---

# 5. Atividades Adaptadas com IA

Sistema gera:

atividades adaptadas  
explicação pedagógica  
BNCC relacionada

Tabela:

activities

---

# 6. Evolução do Aluno

Registro contínuo de:

avanços  
dificuldades  
observações

Tabela:

student_progress

---

# 7. Geração de Documentos

Exportação em:

PDF  
DOCX

Todos os documentos devem conter:

data  
autor  
código de validação  
hash de auditoria

---

# 8. Sistema de Créditos

Usuários possuem créditos para geração de IA.

Consumo ocorre ao gerar:

PEI  
PAEE  
atividades  
relatórios

Tabela:

credits

---

# 9. Planos

FREE  
PRO  
MASTER

Cada plano define:

limite de alunos  
limite de créditos  
recursos disponíveis

Tabela:

plans

---

# FUNCIONALIDADES FUTURAS

## Dashboard pedagógico

gráficos de evolução  
indicadores de aprendizagem  
relatórios por turma

---

## IA pedagógica

assistente que sugere:

estratégias pedagógicas  
adaptações curriculares  
atividades inclusivas

---

## Biblioteca pedagógica

repositório de:

atividades adaptadas  
planos pedagógicos  
materiais inclusivos

---

# PRINCÍPIOS DO PRODUTO

simplicidade  
segurança jurídica  
organização pedagógica  
redução de burocracia