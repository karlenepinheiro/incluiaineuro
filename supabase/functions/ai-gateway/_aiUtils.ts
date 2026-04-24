export async function callAIWithRetryAndTimeout<T>(
  fn: () => Promise<T>,
  retries: number = 1,
  timeoutMs: number = 45_000
): Promise<T> {
  let attempt = 0;
  while (attempt <= retries) {
    try {
      const timeoutPromise = new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT_EXCEEDED')), timeoutMs)
      );
      return await Promise.race([fn(), timeoutPromise]);
    } catch (error: any) {
      if (attempt === retries) throw error;
      console.warn(`[ai-gateway] Falha na IA. Tentativa ${attempt + 1}/${retries + 1} | Erro: ${error.message}`);
      attempt++;
    }
  }
  throw new Error('Falha inesperada no retry da IA');
}

export async function validateAndRepair(jsonString: string): Promise<any> {
  try {
    // Remove blocos de marcação markdown indesejados retornados por LLMs
    const cleaned = jsonString.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(cleaned);

    if (!parsed || typeof parsed !== 'object') throw new Error('A saída gerada não é um objeto.');
    return parsed;
  } catch (error: any) {
    console.error('[ai-gateway] validateAndRepair falhou:', error.message);
    throw new Error(`VALIDATION_ERROR: O formato retornado pela IA está inconsistente. (${error.message})`);
  }
}