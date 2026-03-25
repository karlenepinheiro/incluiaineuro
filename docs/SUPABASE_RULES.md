# SUPABASE_RULES.md
## Regras obrigatórias para uso do Supabase no projeto IncluiAI

Claude deve seguir rigorosamente estas regras ao gerar SQL, migrations ou lógica de backend.

---

# 1. PRINCÍPIO DE SEGURANÇA

O banco de dados do IncluiAI contém dados educacionais sensíveis.

Claude NUNCA deve gerar comandos destrutivos.

Proibido:

DROP TABLE  
DROP COLUMN  
DROP DATABASE  
TRUNCATE  

Sem autorização explícita do usuário.

---

# 2. MIGRATIONS OBRIGATÓRIAS

Toda alteração no banco deve ser feita via migration.

Nunca modificar estrutura diretamente.

Exemplo correto:

ALTER TABLE students
ADD COLUMN diagnosis TEXT;

Exemplo proibido:

Recriar tabela inteira.

---

# 3. TABELAS PRINCIPAIS

Estas tabelas são consideradas críticas e não devem ser removidas:

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

Qualquer modificação deve preservar dados existentes.

---

# 4. LOG DE AUDITORIA

Toda ação importante deve gerar registro em:

audit_logs

Campos obrigatórios:

audit_code  
entity_type  
entity_id  
action  
content_hash  
created_at  

Claude nunca deve remover auditoria.

---

# 5. RELAÇÃO ENTRE DOCUMENTOS

Fluxo obrigatório:

student  
→ case_study  
→ paee  
→ pei  

Nunca permitir:

PEI sem estudo de caso.

---

# 6. PADRÃO DE IDs

IDs devem usar:

UUID

Exemplo:

id UUID PRIMARY KEY DEFAULT gen_random_uuid()

Nunca usar:

serial

---

# 7. RLS (ROW LEVEL SECURITY)

Todas as tabelas devem possuir RLS ativo.

Claude deve sempre considerar:

tenant_id

para separar escolas diferentes.

---

# 8. STORAGE

Arquivos devem ser armazenados no Supabase Storage.

Buckets sugeridos:

documents  
activities  
reports  

Nunca salvar arquivos diretamente no banco.

---

# 9. PERFORMANCE

Claude deve evitar:

SELECT *

Sempre selecionar apenas campos necessários.

---

# 10. REGRA FINAL

Antes de gerar qualquer SQL Claude deve verificar:

1. se não quebra estrutura existente  
2. se mantém dados atuais  
3. se respeita auditoria  
4. se respeita multi-tenant

Se houver dúvida, Claude deve pedir confirmação ao usuário.