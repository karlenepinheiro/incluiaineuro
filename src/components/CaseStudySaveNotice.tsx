import React from 'react';

export function CaseStudySaveNotice({ unsaved, failed, saving, onRetry }: {
  unsaved: boolean; failed: boolean; saving: boolean; onRetry: () => void;
}) {
  if (!unsaved) return null;
  return <div className="w-full max-w-4xl px-4 pt-4 print:hidden">
    <p role="status" className="text-xs font-semibold text-amber-800">RASCUNHO — NÃO SALVO</p>
    {failed && <div role="alert" className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <h3 className="font-semibold text-gray-900">Não foi possível salvar este documento</h3>
      <p className="mt-1 text-sm text-gray-700">O Estudo de Caso foi gerado e permanece disponível. Verifique sua conexão e tente salvar novamente. Nenhum novo crédito será utilizado.</p>
      <button type="button" disabled={saving} onClick={onRetry}
        className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {saving ? 'Salvando…' : 'Tentar salvar novamente'}
      </button>
    </div>}
  </div>;
}
