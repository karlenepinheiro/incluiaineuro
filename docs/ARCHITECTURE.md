# IncluiAI - Arquitetura do Sistema

Stack:
- Frontend: React + Vite + Tailwind
- Backend: Supabase (Auth + DB + RLS)
- Edge Functions: ai-gateway, kiwify-webhook

Regras:

1. Nunca chamar IA diretamente do frontend
→ Sempre usar ai-gateway

2. Créditos:
→ Fonte única: credits_wallet.balance
→ Ledger é histórico, não validação

3. Documentos:
→ Sempre usar templates padronizados
→ Nunca renderizar JSON cru

4. PDF:
→ Baseado em layout A4 institucional
→ Não usar markdown simples

5. Autenticação:
→ Não modificar fluxo Supabase Auth