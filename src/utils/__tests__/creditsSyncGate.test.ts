/**
 * creditsSyncGate.test.ts — Sprint "consumo no momento certo" (ajuste 26/08/2026)
 *
 * Cobre o contrato de src/utils/creditsSyncGate.ts, usado por
 * StudentImportModal para decidir QUANDO recarregar o saldo de créditos
 * exibido (tenantSummary) — nunca SE cobrar (isso é 100% do AI Gateway,
 * já coberto por src/__tests__/aiGatewayUsability.test.ts).
 *
 * Os 4 cenários pedidos na investigação do teste manual do PNG:
 *   1. Análise concluída abre revisão e atualiza saldo (uma vez).
 *   2. Cancelar não restaura saldo — não há "undo": fechar depois de uma
 *      análise bem-sucedida não dispara uma segunda notificação nem desfaz
 *      a primeira.
 *   3. Salvar não produz novo débito — não existe nenhum caminho no gate
 *      que gere uma segunda cobrança/notificação para a mesma tentativa;
 *      fechar depois de salvar (que já passou por uma análise bem-sucedida)
 *      continua sem duplicar.
 *   4. Fechar antes de processar não gera refresh financeiro indevido —
 *      nenhuma notificação se nenhuma análise foi tentada.
 */
import { describe, it, expect, vi } from 'vitest';
import { createCreditsSyncGate } from '../creditsSyncGate';

describe('creditsSyncGate', () => {
  it('1) análise concluída (beginAttempt + notifyOnSuccess) notifica exatamente uma vez ao abrir a revisão', () => {
    const gate = createCreditsSyncGate();
    const notify = vi.fn();

    gate.beginAttempt(); // início da chamada de IA billable
    gate.notifyOnSuccess(notify); // resposta utilizável chegou, revisão abriu

    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('2) cancelar depois de uma análise concluída não dispara uma segunda notificação (nada a "restaurar")', () => {
    const gate = createCreditsSyncGate();
    const notify = vi.fn();

    gate.beginAttempt();
    gate.notifyOnSuccess(notify); // saldo já sincronizado quando a revisão abriu

    gate.notifyOnClose(notify); // usuário cancela/fecha sem salvar

    expect(notify).toHaveBeenCalledTimes(1); // sem duplicar, sem "desfazer"
  });

  it('2b) rede de segurança: fechar ANTES da análise terminar (ex.: fechou com a chamada em voo) ainda notifica uma vez', () => {
    const gate = createCreditsSyncGate();
    const notify = vi.fn();

    gate.beginAttempt(); // chamada de IA em voo — ainda não resolveu
    gate.notifyOnClose(notify); // usuário fecha antes da resposta chegar

    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('3) salvar não produz nova notificação/débito: fechar após "salvar" (que já passou por notifyOnSuccess) não duplica', () => {
    const gate = createCreditsSyncGate();
    const notify = vi.fn();

    gate.beginAttempt();
    gate.notifyOnSuccess(notify); // crédito já cobrado e sincronizado ao abrir a revisão

    // Simula o fluxo de salvar: nenhuma nova tentativa de IA é iniciada
    // (não há novo beginAttempt/notifyOnSuccess no caminho de salvar) — o
    // botão final de "done" chama onClose diretamente.
    gate.notifyOnClose(notify);

    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('4) fechar antes de processar não gera nenhum refresh financeiro indevido', () => {
    const gate = createCreditsSyncGate();
    const notify = vi.fn();

    // Nenhuma análise foi tentada (nenhum beginAttempt).
    gate.notifyOnClose(notify);

    expect(notify).not.toHaveBeenCalled();
  });

  it('5) uma nova tentativa reabre a janela de sincronização (retry após cancelar/reenviar)', () => {
    const gate = createCreditsSyncGate();
    const notifyFirst = vi.fn();
    const notifySecond = vi.fn();

    gate.beginAttempt();
    gate.notifyOnSuccess(notifyFirst);
    expect(notifyFirst).toHaveBeenCalledTimes(1);

    // Usuário troca de arquivo/tenta de novo — nova chamada de IA billable.
    gate.beginAttempt();
    gate.notifyOnSuccess(notifySecond);

    expect(notifySecond).toHaveBeenCalledTimes(1);
  });

  it('re-render/edição de campos não deve re-disparar notificação (nenhuma chamada extra sem novo beginAttempt/notifyOnSuccess/notifyOnClose)', () => {
    const gate = createCreditsSyncGate();
    const notify = vi.fn();

    gate.beginAttempt();
    gate.notifyOnSuccess(notify);

    // "Re-render" simulado: nada chama o gate de novo — editar um campo do
    // draft, por exemplo, não invoca beginAttempt/notifyOnSuccess/notifyOnClose.
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
