# Regras Permanentes de Segurança — IncluiAI.app 2.0

Este documento define regras obrigatórias para qualquer análise, prompt, auditoria, correção, implementação ou alteração relacionada ao projeto **IncluiAI.app 2.0**.

Estas regras existem porque o projeto já possui dados reais, clientes ativos, compras, assinaturas, usuários, alunos cadastrados e histórico no Supabase/Kiwify. Portanto, nenhuma ação deve colocar esses dados em risco.

---

## 1. Regra principal

Antes de qualquer alteração, deve ser feita uma **auditoria técnica e funcional**.

Nenhum código, banco, migration, trigger, função, webhook, tela ou regra de negócio deve ser alterado sem antes existir:

1. diagnóstico;
2. leitura do estado atual;
3. confirmação do schema real;
4. identificação dos riscos;
5. proposta de correção;
6. validação da CEO;
7. plano de rollback;
8. registro em auditoria.

---

## 2. Banco de dados: regra crítica

O banco Supabase possui dados reais e importantes.

É expressamente proibido pedir, sugerir ou executar qualquer ação que possa apagar, recriar ou comprometer dados existentes.

### É proibido:

- resetar o banco;
- limpar o banco;
- recriar o banco do zero;
- apagar tabelas;
- truncar tabelas;
- dropar tabelas;
- dropar schema;
- substituir schema real por schema presumido;
- rodar migration destrutiva;
- executar `DROP`;
- executar `TRUNCATE`;
- executar `DELETE` sem aprovação explícita;
- executar `UPDATE` em massa sem diagnóstico prévio;
- executar `INSERT` de correção sem validação;
- apagar usuários;
- apagar tenants;
- apagar alunos;
- apagar assinaturas;
- apagar compras Kiwify;
- apagar créditos;
- apagar histórico;
- apagar documentos gerados;
- remover dados de produção sem backup.

---

## 3. Ordem obrigatória antes de qualquer mudança

Qualquer solicitação para Claude, Codex, Gemini ou outro agente deve seguir esta ordem:

1. **Auditoria primeiro**
   - Entender o problema.
   - Verificar arquivos envolvidos.
   - Verificar fluxo atual.
   - Verificar riscos.

2. **Diagnóstico somente leitura**
   - Usar apenas `SELECT`.
   - Usar `information_schema`.
   - Listar tabelas, colunas, triggers, funções e relações.
   - Nunca presumir nomes de tabelas ou colunas.

3. **Confirmação do schema real**
   - Confirmar tabelas existentes.
   - Confirmar colunas reais.
   - Confirmar tipos dos campos.
   - Confirmar chaves e relacionamentos.
   - Confirmar triggers e funções existentes.

4. **Proposta de correção**
   - Explicar o problema.
   - Explicar a causa provável.
   - Explicar o risco.
   - Explicar alternativas.
   - Não executar ainda.

5. **Validação da CEO**
   - A CEO deve aprovar a direção da correção.
   - Nenhuma ação destrutiva pode ser automática.

6. **Backup e plano de rollback**
   - Definir quais dados precisam ser exportados.
   - Definir como restaurar em caso de erro.
   - Validar se a correção pode ser revertida.

7. **Execução segura**
   - Primeiro em ambiente seguro, se houver.
   - Depois com amostra pequena, quando aplicável.
   - Só depois em produção, com aprovação explícita.

8. **Registro em auditoria**
   - Toda análise ou correção deve ser documentada em `auditorias/`.

---

## 4. Regras para prompts técnicos

Todo prompt técnico relacionado ao IncluiAI deve conter um bloco de segurança.

### Bloco obrigatório de segurança

```text
REGRA CRÍTICA DE SEGURANÇA DO PROJETO:
O banco Supabase já possui dados reais e importantes.

É proibido:
- resetar o banco;
- apagar dados;
- dropar tabelas;
- truncar tabelas;
- recriar schema do zero;
- rodar migration destrutiva;
- executar UPDATE/DELETE/INSERT sem aprovação explícita;
- alterar produção sem backup, amostra, validação e plano de rollback.

Nesta etapa, use somente diagnóstico, leitura, SELECT e information_schema.
Qualquer correção deve ser apenas proposta, nunca executada automaticamente.
```

---

## 5. Regras específicas para Supabase

Antes de qualquer SQL definitivo, é obrigatório consultar o schema real.

### Permitido em fase de diagnóstico:

- `SELECT`;
- consultas em `information_schema`;
- consultas em `pg_catalog` para listar triggers, funções e policies;
- contagens;
- amostras limitadas;
- queries de comparação;
- queries de identificação de divergências.

### Não permitido sem aprovação explícita:

- `UPDATE`;
- `DELETE`;
- `INSERT`;
- `ALTER`;
- `DROP`;
- `TRUNCATE`;
- `CREATE`;
- `CREATE OR REPLACE FUNCTION`;
- `DROP TRIGGER`;
- `DISABLE TRIGGER`;
- migrations automáticas;
- reset de projeto;
- seed que sobrescreve dados.

---

## 6. Regras sobre triggers e funções

O projeto já identificou triggers que criam contas FREE automaticamente.

Mesmo assim, nenhuma trigger deve ser removida diretamente sem:

1. listar triggers existentes;
2. identificar a função associada;
3. entender quando ela dispara;
4. verificar impacto em cadastro, tenant, assinatura, plano, créditos e Kiwify;
5. testar alternativa;
6. criar plano de rollback;
7. obter aprovação explícita da CEO.

### Proibido:

- remover trigger sem auditoria;
- alterar função sem backup;
- substituir função inteira sem entender dependências;
- recriar fluxo de cadastro presumindo nomes;
- mexer em produção sem validação.

---

## 7. Regras sobre Kiwify e assinaturas

A Kiwify e o registro interno da assinatura devem ser tratados como fonte prioritária para plano, pagamento e ativação.

### É obrigatório diagnosticar:

- produto comprado;
- status financeiro;
- e-mail da compra;
- vínculo com usuário;
- vínculo com tenant;
- plano aplicado;
- assinatura ativa;
- histórico de webhook;
- eventuais duplicidades.

### Nunca fazer automaticamente:

- transformar cliente pago em FREE;
- remover plano de cliente pago sem revisão;
- cancelar acesso por falha de webhook;
- vincular compra a usuário apenas por suposição;
- ignorar compra com e-mail diferente;
- apagar compra não vinculada.

Compras com divergência devem ir para **revisão manual**.

---

## 8. Regras sobre clientes Fundadores

Clientes antigos devem ser preservados.

### PRO Fundador

- Preço preservado enquanto a assinatura estiver ativa.
- Limites preservados conforme plano antigo.
- Não pode ser rebaixado automaticamente.

### MASTER Fundador

- Preço preservado enquanto a assinatura estiver ativa.
- Limite antigo preservado enquanto a assinatura estiver ativa.
- Plano não deve ser vendido para novos clientes.
- Não pode ser reduzido automaticamente.

### Proibido:

- forçar migração;
- remover benefício contratado;
- reduzir limite sem comunicação;
- apagar alunos por mudança de plano;
- arquivar alunos automaticamente;
- retirar status Fundador por bug técnico;
- impedir acesso de cliente pago sem revisão.

---

## 9. Regras sobre plano FREE

O FREE será retirado comercialmente no IncluiAI 2.0.

### Regras:

- FREE não deve ser vendido;
- FREE não deve aparecer como opção comercial;
- cadastro sem compra aprovada não deve liberar acesso;
- ausência de assinatura deve ser status de conta, não plano;
- contas FREE antigas devem ser analisadas antes de qualquer ação.

### Proibido:

- criar FREE automaticamente;
- usar FREE como fallback de erro;
- transformar cliente pago em FREE;
- criar conta FREE por trigger sem validação;
- apagar contas FREE antigas sem plano de comunicação.

---

## 10. Regras sobre créditos

O modelo futuro prevê créditos em lotes, mas isso não deve ser implementado sem diagnóstico.

### Antes de alterar créditos, verificar:

- saldo atual;
- origem dos créditos;
- plano vinculado;
- divergência entre 10 e 60 créditos;
- créditos por plano atual;
- clientes PRO;
- clientes MASTER;
- usuários FREE;
- histórico disponível;
- se existe saldo único ou estrutura mais complexa.

### Proibido:

- zerar créditos;
- sobrescrever saldos;
- alterar créditos em massa;
- criar regra de expiração sem comunicação;
- remover créditos de cliente pago sem auditoria.

---

## 11. Regras sobre alunos e dados sensíveis

O IncluiAI lida com dados educacionais e possivelmente sensíveis de alunos.

### É proibido:

- apagar alunos em massa;
- arquivar alunos automaticamente;
- remover histórico pedagógico;
- remover documentos gerados;
- expor dados sensíveis em logs desnecessários;
- usar dados reais em testes públicos;
- exportar dados sem necessidade;
- compartilhar dados pessoais em prompts externos sem anonimização.

### Regra de limite:

- aluno ativo ocupa vaga;
- aluno em triagem ocupa vaga;
- aluno com suspeita ocupa vaga;
- aluno sem laudo ocupa vaga;
- aluno arquivado não ocupa vaga;
- aluno arquivado mantém histórico.

---

## 12. Regras sobre produção

Produção deve ser tratada com cautela máxima.

### Antes de mexer em produção:

1. confirmar ambiente;
2. confirmar usuário/projeto Supabase;
3. confirmar se há backup;
4. confirmar impacto;
5. executar diagnóstico somente leitura;
6. validar com a CEO;
7. executar fora de horário crítico, quando possível;
8. registrar tudo em auditoria.

### Proibido:

- testar correções destrutivas em produção;
- rodar script grande sem amostra;
- rodar correção sem backup;
- confiar em nomes presumidos;
- copiar solução de outro projeto sem adaptar ao schema real.

---

## 13. Regras sobre código

Antes de qualquer alteração de código:

1. localizar arquivos envolvidos;
2. entender o fluxo atual;
3. mapear dependências;
4. verificar riscos;
5. propor alteração;
6. validar com a CEO;
7. alterar de forma mínima;
8. testar;
9. documentar.

### Proibido:

- reescrever arquivo inteiro sem necessidade;
- quebrar fluxo existente;
- remover funcionalidade sem autorização;
- alterar autenticação sem auditoria;
- alterar billing sem diagnóstico;
- alterar permissões sem matriz clara;
- misturar redesign visual com alteração crítica de regra de negócio sem separação.

---

## 14. Regras sobre documentação de auditoria

Toda etapa relevante deve gerar registro em `auditorias/`.

### O registro deve conter:

- data;
- objetivo;
- escopo;
- arquivos analisados;
- tabelas analisadas, se houver;
- riscos encontrados;
- decisões tomadas;
- o que foi alterado;
- o que não foi alterado;
- próximos passos;
- status final.

### Regra:

Se não foi documentado, não deve ser considerado validado.

---

## 15. Checklist obrigatório antes de qualquer prompt de implementação

Antes de pedir implementação, responder:

- [ ] Foi feita auditoria?
- [ ] O schema real foi confirmado?
- [ ] A alteração mexe no banco?
- [ ] Existe risco de perda de dados?
- [ ] Existe backup?
- [ ] Existe plano de rollback?
- [ ] A CEO aprovou?
- [ ] A mudança é reversível?
- [ ] Afeta clientes pagos?
- [ ] Afeta clientes Fundadores?
- [ ] Afeta Kiwify?
- [ ] Afeta créditos?
- [ ] Afeta alunos?
- [ ] Foi registrado em auditoria?

Se qualquer resposta crítica for “não”, a implementação deve ser bloqueada.

---

## 16. Frase padrão para todos os agentes

Sempre que um agente for acionado, incluir:

```text
Antes de propor qualquer implementação, audite o estado atual. Não altere banco, não resete dados, não crie migration destrutiva e não execute comandos de escrita. O projeto possui dados reais em produção. Trabalhe primeiro com diagnóstico, SELECT, information_schema, análise de risco e proposta documentada. Qualquer correção depende de aprovação explícita da CEO.
```

---

## 17. Regra final

A prioridade do IncluiAI.app 2.0 é evoluir sem perder dados, sem prejudicar clientes atuais e sem gerar inconsistências no billing.

Portanto:

> **Auditoria primeiro. Diagnóstico antes de correção. Correção somente com aprovação. Banco real nunca deve ser resetado. Dados reais nunca devem ser apagados sem decisão formal, backup e plano de rollback.**
