/**
 * creditsSyncGate.ts — Sprint "consumo no momento certo" (ajuste 26/08/2026)
 *
 * Controla QUANDO o app deve recarregar o saldo de créditos exibido
 * (tenantSummary) durante o fluxo de importação de IA do Cadastro
 * Inteligente. O AI Gateway já reserva, chama o provider e confirma (commit)
 * o crédito atomicamente numa única requisição, ANTES de qualquer
 * salvamento (ver supabase/functions/ai-gateway/_usability.ts). O problema
 * que este módulo resolve é só de UI: o número exibido em outras telas
 * (Dashboard/Assinatura) vive em estado React (`tenantSummary`) que não se
 * atualiza sozinho — alguém precisa pedir o refresh, uma única vez, no
 * momento certo.
 *
 * Regras garantidas por este gate (sem depender de React, sem chamar IA,
 * sem cobrar nada — só decide SE/QUANDO avisar o chamador):
 *   1. Uma notificação assim que uma análise utilizável entrega a revisão.
 *   2. Nenhuma notificação duplicada para a mesma tentativa (abrir revisão
 *      + fechar em seguida não dispara duas chamadas).
 *   3. Nenhuma notificação se nada chegou a ser tentado (fechar o modal
 *      antes de processar não gera refresh financeiro indevido).
 *   4. Rede de segurança ao fechar/cancelar: só dispara se uma tentativa
 *      ficou pendente de sincronização (ex.: fechou no meio da chamada).
 *   5. Uma nova tentativa (novo upload/nova análise) reabre a janela — o
 *      gate não "trava" notificado para sempre.
 *
 * Função pura, sem dependência de React nem do runtime do navegador —
 * testável diretamente (ver src/utils/__tests__/creditsSyncGate.test.ts).
 */

export interface CreditsSyncGate {
  /** Chame ao iniciar uma nova chamada de IA billable (antes do await). */
  beginAttempt(): void;
  /**
   * Chame ao receber uma resposta utilizável (a revisão acabou de abrir).
   * Chama `notify` no máximo uma vez por tentativa.
   */
  notifyOnSuccess(notify: () => void): void;
  /**
   * Chame ao fechar/cancelar o modal. Só chama `notify` se havia uma
   * tentativa iniciada (`beginAttempt`) que ainda não foi sincronizada — ou
   * seja, nunca dispara se nada foi processado, e nunca duplica se
   * `notifyOnSuccess` já rodou para esta tentativa.
   */
  notifyOnClose(notify: () => void): void;
}

export function createCreditsSyncGate(): CreditsSyncGate {
  let attempted = false;
  let synced = false;

  const notifyOnce = (notify: () => void) => {
    if (synced) return;
    synced = true;
    notify();
  };

  return {
    beginAttempt() {
      // Nova tentativa: reabre a janela de sincronização. Uma tentativa
      // anterior (se houve) já foi resolvida por notifyOnSuccess/notifyOnClose
      // antes deste ponto ser alcançado de novo (guard de duplo clique do
      // chamador impede uma 2ª chamada de IA em voo).
      attempted = true;
      synced = false;
    },
    notifyOnSuccess(notify) {
      notifyOnce(notify);
    },
    notifyOnClose(notify) {
      if (!attempted) return;
      notifyOnce(notify);
    },
  };
}
