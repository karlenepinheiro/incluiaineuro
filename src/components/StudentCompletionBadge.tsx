import React, { useId, useRef } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { getStudentCompletionStatus } from '../services/studentCompletionStatus';
import type { Student } from '../types';

export function StudentCompletionBadge({ student }: { student: Student }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const { isComplete, incompleteSections } = getStudentCompletionStatus(student);
  if (isComplete) return <span className="inline-flex max-w-full min-w-0 items-center gap-1 whitespace-normal rounded-full px-2 py-1 text-xs bg-emerald-50 text-emerald-800 border border-emerald-200"><CheckCircle2 size={12} />Cadastro completo</span>;
  return <span className="min-w-0 max-w-full" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
    <button ref={trigger} type="button" popoverTarget={id} aria-controls={id} aria-haspopup="dialog"
      className="inline-flex max-w-full min-w-0 items-center gap-1 whitespace-normal rounded-full px-2 py-1 text-xs bg-red-50 text-red-800 border border-red-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-800">
      <AlertCircle size={12} />Cadastro incompleto · {incompleteSections.length} {incompleteSections.length === 1 ? 'bloco pendente' : 'blocos pendentes'}
    </button>
    <div id={id} popover="auto" onToggle={event => {
      const popover = event.currentTarget;
      if (!popover.matches(':popover-open') || !trigger.current) return;
      const anchor = trigger.current.getBoundingClientRect();
      const width = popover.offsetWidth, height = popover.offsetHeight;
      popover.style.margin = '0';
      popover.style.left = Math.max(16, Math.min(anchor.left, window.innerWidth - width - 16)) + 'px';
      popover.style.top = Math.max(16, Math.min(anchor.bottom + 6, window.innerHeight - height - 16)) + 'px';
    }} role="dialog" aria-label="Pendências do cadastro"
      className="m-auto p-4 rounded-xl border border-red-200 shadow-xl bg-white text-gray-800 text-sm max-w-[calc(100vw-32px)] w-80">
      <p className="font-semibold">Blocos a concluir</p>
      <ul className="list-disc pl-5 mt-2 space-y-1">{incompleteSections.map(section => <li key={section.id}>{section.label}</li>)}</ul>
      <button type="button" popoverTarget={id} popoverTargetAction="hide" className="mt-3 text-xs underline">Fechar</button>
    </div>
  </span>;
}
