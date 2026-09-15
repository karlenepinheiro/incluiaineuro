import type { DocumentData, Protocol } from '../types';

/** Uses the existing document persistence service. No generation/credit dependency. */
export async function persistConfirmedCaseStudy(protocol: Protocol, persist: (value: Protocol) => Promise<any>): Promise<Protocol> {
  const row = await persist(protocol);
  if (!row?.id || (protocol.status === 'FINAL' && !['APPROVED','SIGNED','FINAL'].includes(row.status))) {
    throw new Error('SAVE_NOT_CONFIRMED');
  }
  return { ...protocol, id: row.id, auditCode: row.audit_code || protocol.auditCode };
}

export function createCaseStudySaveRecovery(key: string, sourceId: string | undefined, notify: () => void) {
  let recovered: { data: DocumentData; id: string; sourceId?: string } | null = null;
  try {
    const item = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (item?.id && Array.isArray(item?.data?.sections) && (!sourceId || item.sourceId === sourceId || item.id === sourceId)) recovered = item;
  } catch { /* Best-effort local recovery. */ }
  const state = {
    saving: false, pendingSave: !!recovered, failed: !!recovered,
    document: recovered?.data ?? null as DocumentData | null,
    id: recovered?.id || (sourceId && sourceId !== 'temp' ? sourceId : crypto.randomUUID()),
    lastSavedDocument: null as Protocol | null,
    restored: recovered?.data ?? null as DocumentData | null,
  };
  return {
    state,
    capture(data: DocumentData) {
      state.document = structuredClone(data);
      try { sessionStorage.setItem(key, JSON.stringify({ data: state.document, id: state.id, sourceId })); } catch {}
    },
    async save(data: DocumentData, persist: (data: DocumentData, id: string) => Promise<Protocol | void>): Promise<boolean> {
      if (state.saving) return false; // Synchronous lock, including two clicks before React renders.
      state.saving = true;
      state.pendingSave = true;
      this.capture(data);
      notify();
      try {
        const saved = await persist(state.document!, state.id);
        if (!saved?.id) throw new Error('SAVE_NOT_CONFIRMED');
        state.id = saved.id;
        state.lastSavedDocument = saved;
        state.pendingSave = false;
        state.failed = false;
        state.restored = null;
        try { sessionStorage.removeItem(key); } catch {}
        return true;
      } catch {
        state.pendingSave = true;
        state.failed = true;
        return false;
      } finally {
        state.saving = false;
        notify();
      }
    },
  };
}
