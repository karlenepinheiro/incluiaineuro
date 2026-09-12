type Attempt = { operationId: string; generatedAt: string };
const pending = new Map<string, Attempt>();
/** Retain metadata across network retries/reloads so the gateway fingerprint is stable. */
export async function getAeeGenerationAttempt(input: unknown, preferredId?: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(input)));
  const key = 'incluiai:aee-attempt:' + Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  let attempt = pending.get(key);
  if (!attempt) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (saved?.operationId && saved?.generatedAt) attempt = saved;
    } catch { /* Storage may be unavailable; memory still supports retries. */ }
  }
  const isRetry = !!attempt;
  attempt ??= { operationId: preferredId || crypto.randomUUID(), generatedAt: new Date().toISOString() };
  pending.set(key, attempt);
  try { sessionStorage.setItem(key, JSON.stringify(attempt)); } catch {}
  return { ...attempt, isRetry, complete() {
    pending.delete(key);
    try { sessionStorage.removeItem(key); } catch {}
  } };
}
