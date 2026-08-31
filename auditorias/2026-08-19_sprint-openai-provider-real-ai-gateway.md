# Sprint OpenAI Provider Real no AI Gateway - 2026-08-19

## Objetivo

Conectar OpenAI como provider real do `ai-gateway`, preservando Gemini como default seguro e sem alterar banco, frontend provider-specific, pipeline pedagogico canonico, autosave, Biblioteca ou export PDF/PNG.

## Escopo Alterado

- `supabase/functions/ai-gateway/_openaiProvider.ts`
- `supabase/functions/ai-gateway/_modelConfig.ts`
- `supabase/functions/ai-gateway/_router.ts`
- `supabase/functions/ai-gateway/_types.ts`
- `supabase/functions/ai-gateway/_geminiProvider.ts`
- `supabase/functions/ai-gateway/_audit.ts`
- `supabase/functions/ai-gateway/index.ts`
- `src/__tests__/aiGatewayOpenAIProvider.test.ts`
- `src/__tests__/aiGatewayRouter.test.ts`

## Decisoes

- OpenAI usa `OPENAI_API_KEY` somente server-side no Gateway.
- API usada: OpenAI Responses API via `fetch`, sem SDK no Edge Function.
- Gemini continua default: `AI_ROUTER_MODE` ausente ou invalido cai em `gemini`.
- OpenAI exige `AI_ROUTER_MODE=openai` e `AI_OPENAI_ENABLED=true`.
- Fallback e limitado a dois providers e apenas para erro recuperavel de provider.
- OpenAI image ficou preparado na interface, mas nao implementado nesta Sprint para evitar migrar Visual/Premium por acidente.

## O Que Nao Foi Alterado

- Banco e migrations.
- Gateway de creditos/RPCs alem de metadata ja aceita.
- Pipeline textual canonico do IncluiLAB.
- Autosave e Biblioteca.
- Export PDF/PNG.
- Visual/Premium completo.
- Codigo legado fora do Gateway: `api/openai-generate-activity-image.ts` e `src/services/openaiActivityImageService.ts`.

## Validacao

- `npm test -- --reporter=dot`: 202/202 PASS.
- `npm run build`: PASS.
- Warnings de build observados: imports dinamicos/estaticos ja existentes e chunk acima de 500 kB.

## Pendencias

- Smoke real OpenAI pelo Gateway nao executado nesta maquina: `OPENAI_API_KEY` e `SUPABASE_ACCESS_TOKEN` locais ausentes, e nao houve deploy de producao nesta etapa.
- Deploy futuro deve limitar-se a `supabase functions deploy ai-gateway` apos confirmacao de secrets e JWT/sessao de teste.

## Rollback

- `AI_ROUTER_MODE=gemini` mantem Gemini como provider principal.
- `AI_OPENAI_ENABLED=false` impede selecao de OpenAI.
- `AI_FALLBACK_ENABLED=false` desliga fallback entre providers.
- Nao ha rollback de banco.
