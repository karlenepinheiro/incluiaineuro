/**
 * Testes da Fase 1 — Cadastro Inteligente / Importar Aluno por Documento com IA.
 *
 * Cobre exclusivamente lógica pura e caminhos sem dependência de DOM real
 * (File/FileReader/<canvas> do navegador não existem no ambiente de teste
 * `node` deste projeto — ver vitest.config.ts). `callAIGateway` e
 * `databaseService` são mockados; nenhum crédito real é consumido, nenhuma
 * chamada de rede é feita, nenhum dado real de aluno é usado (fixtures
 * sintéticas).
 *
 * Nota de ambiente: `studentDocumentImportService.ts` importa `pdfjs-dist`,
 * que referencia `DOMMatrix` já na avaliação do módulo (para registrar seu
 * CanvasFactory), mesmo sem chamar nenhuma função de renderização. Como o
 * ambiente de teste é `node` puro (sem jsdom), o módulo é importado
 * DINAMICAMENTE em `beforeAll`, depois de um stub mínimo de `DOMMatrix` —
 * isso não instala nenhuma dependência nova nem altera vitest.config.ts.
 *
 * O que NÃO é coberto aqui (limitação honesta): `renderScannedPdfPages`
 * (renderização de PDF em `<canvas>`, leitura multipágina) depende de APIs
 * de navegador indisponíveis neste ambiente — exige verificação manual no
 * navegador (ver roteiro no relatório da leitura multipágina). O plano de
 * páginas (quantas/quais renderizar, mensagens, detecção de página em
 * branco) é lógica pura e É coberto — ver src/utils/__tests__/pdfMultiPage.test.ts.
 * O ramo de imagem (`fileToBase64`, via FileReader) já é coberto abaixo com
 * um stub mínimo de `FileReader` — suficiente para testar o payload enviado
 * ao Gateway (task, mimetype), sem precisar de um navegador real.
 */
import { describe, expect, it, vi, beforeAll, beforeEach } from 'vitest';
import type { EditableDraft } from '../studentDocumentImportService';

(globalThis as any).DOMMatrix ??= class DOMMatrix {};

// Stub mínimo de FileReader — suficiente para exercitar fileToBase64() sem
// navegador real. `file` só precisa se comportar como um File (type/name);
// não instancia um File real do DOM.
class FakeFileReader {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  result: string | null = null;
  readAsDataURL(file: { type?: string }) {
    // Payload base64 arbitrário — o conteúdo em si não importa para estes
    // testes, só o mimetype no prefixo do data URL e o fluxo de chamada.
    this.result = `data:${file?.type || ''};base64,ZmFrZS1pbWFnZS1ieXRlcw==`;
    queueMicrotask(() => this.onload && this.onload());
  }
}
(globalThis as any).FileReader ??= FakeFileReader;

const saveStudentMock = vi.fn(async (_payload: any) => ({ id: 'student-1' }));

vi.mock('../databaseService', () => ({
  databaseService: {
    saveStudent: (payload: any) => saveStudentMock(payload),
  },
}));

const callAIGatewayMock = vi.fn();

vi.mock('../aiGatewayService', () => ({
  callAIGateway: (req: any) => callAIGatewayMock(req),
}));

let resolveAcceptedImageMimeType: any;
let rebuildDataUrlWithMimeType: any;
let buildPageDisclosureMessage: any;
let buildScannedPdfPreProcessingNotice: any;
let normalizeImportedStudentFromDocument: any;
let mergeObservationsWithRecommendations: any;
let mapDocumentTextToStudentPayload: any;
let mapVisualDocumentToStudentPayload: any;
let saveStudentsFromDocx: any;
let MAX_DOCUMENT_TEXT_CHARS: number;
let CREDITS_VISUAL: number;

beforeAll(async () => {
  const mod = await import('../studentDocumentImportService');
  resolveAcceptedImageMimeType = mod.resolveAcceptedImageMimeType;
  rebuildDataUrlWithMimeType = mod.rebuildDataUrlWithMimeType;
  buildPageDisclosureMessage = mod.buildPageDisclosureMessage;
  buildScannedPdfPreProcessingNotice = mod.buildScannedPdfPreProcessingNotice;
  normalizeImportedStudentFromDocument = mod.normalizeImportedStudentFromDocument;
  mergeObservationsWithRecommendations = mod.mergeObservationsWithRecommendations;
  mapDocumentTextToStudentPayload = mod.mapDocumentTextToStudentPayload;
  mapVisualDocumentToStudentPayload = mod.mapVisualDocumentToStudentPayload;
  saveStudentsFromDocx = mod.saveStudentsFromDocx;
  MAX_DOCUMENT_TEXT_CHARS = mod.MAX_DOCUMENT_TEXT_CHARS;
  CREDITS_VISUAL = mod.CREDITS_VISUAL;
});

beforeEach(() => {
  saveStudentMock.mockClear();
  callAIGatewayMock.mockReset();
});

// ─── resolveAcceptedImageMimeType ────────────────────────────────────────────

describe('resolveAcceptedImageMimeType', () => {
  it('reconhece JPEG pelo file.type', () => {
    expect(resolveAcceptedImageMimeType({ type: 'image/jpeg', name: 'foto.jpg' })).toBe('image/jpeg');
  });

  it('reconhece PNG pelo file.type', () => {
    expect(resolveAcceptedImageMimeType({ type: 'image/png', name: 'ficha.png' })).toBe('image/png');
  });

  it('reconhece WEBP pelo file.type', () => {
    expect(resolveAcceptedImageMimeType({ type: 'image/webp', name: 'ficha.webp' })).toBe('image/webp');
  });

  it('usa a extensão como reforço quando file.type está ausente', () => {
    expect(resolveAcceptedImageMimeType({ type: '', name: 'ficha.png' })).toBe('image/png');
    expect(resolveAcceptedImageMimeType({ name: 'foto.jpeg' })).toBe('image/jpeg');
  });

  it('rejeita (retorna null) um arquivo incompatível — extensão de imagem mas type real diferente', () => {
    expect(resolveAcceptedImageMimeType({ type: 'application/pdf', name: 'fake.png' })).toBeNull();
  });

  it('rejeita (retorna null) um formato não suportado, mesmo sem file.type', () => {
    expect(resolveAcceptedImageMimeType({ type: '', name: 'ficha.heic' })).toBeNull();
    expect(resolveAcceptedImageMimeType({ type: 'image/heic', name: 'ficha.heic' })).toBeNull();
  });

  it('rejeita .doc (não é imagem)', () => {
    expect(resolveAcceptedImageMimeType({ type: 'application/msword', name: 'ficha.doc' })).toBeNull();
  });
});

// ─── rebuildDataUrlWithMimeType ──────────────────────────────────────────────

describe('rebuildDataUrlWithMimeType', () => {
  it('substitui o mimetype de um data URL existente, preservando o payload', () => {
    expect(rebuildDataUrlWithMimeType('data:image/jpeg;base64,AAAA', 'image/png'))
      .toBe('data:image/png;base64,AAAA');
  });

  it('funciona mesmo quando recebe apenas o payload base64 puro (sem prefixo)', () => {
    expect(rebuildDataUrlWithMimeType('AAAA', 'image/webp')).toBe('data:image/webp;base64,AAAA');
  });
});

// ─── buildPageDisclosureMessage ──────────────────────────────────────────────

describe('buildPageDisclosureMessage', () => {
  it('retorna null quando todas as páginas foram analisadas', () => {
    expect(buildPageDisclosureMessage(3, 3)).toBeNull();
    expect(buildPageDisclosureMessage(1, 1)).toBeNull();
  });

  it('avisa "apenas a primeira" quando só 1 de várias foi lida', () => {
    const msg = buildPageDisclosureMessage(5, 1);
    expect(msg).toContain('5 páginas');
    expect(msg).toContain('apenas a primeira');
  });

  it('avisa a quantidade exata quando mais de 1 página foi lida, mas não todas', () => {
    const msg = buildPageDisclosureMessage(8, 5);
    expect(msg).toContain('8 páginas');
    expect(msg).toContain('primeiras 5');
  });
});

describe('buildScannedPdfPreProcessingNotice — aviso ANTES do processamento, com contagem real de páginas', () => {
  it('usa a contagem real quando o documento tem mais de 1 página (achado do teste manual de 26/08)', () => {
    const msg = buildScannedPdfPreProcessingNotice(2);
    expect(msg).toBe('Seu documento possui 2 páginas. Nesta versão, foi analisada apenas a primeira.');
  });

  it('mensagem específica para documento de 1 única página (não fala em "apenas a primeira")', () => {
    const msg = buildScannedPdfPreProcessingNotice(1);
    expect(msg).toBe('PDF escaneado detectado. A única página do documento será analisada por leitura visual.');
  });

  it('mensagem honesta quando a contagem de páginas não pôde ser determinada (PDF protegido/corrompido)', () => {
    const msg = buildScannedPdfPreProcessingNotice(null);
    expect(msg).toContain('Não foi possível determinar o número de páginas');
  });

  it('nunca retorna null — é sempre informativa, mesmo para 1 página', () => {
    expect(buildScannedPdfPreProcessingNotice(1)).not.toBeNull();
    expect(buildScannedPdfPreProcessingNotice(5)).not.toBeNull();
    expect(buildScannedPdfPreProcessingNotice(null)).not.toBeNull();
  });
});

// ─── normalizeImportedStudentFromDocument ────────────────────────────────────

describe('normalizeImportedStudentFromDocument — nome ausente não é mais motivo de descarte', () => {
  it('mantém o draft mesmo sem nome, sinalizando "name" em needsReview (não inventa)', () => {
    const draft = normalizeImportedStudentFromDocument({ grade: '5º ano', schoolName: 'EMEF Central' });
    expect(draft.name).toBe('');
    expect(draft.needsReview).toContain('name');
    expect(draft.grade).toBe('5º ano');
  });

  it('não duplica "name" em needsReview quando a IA já sinalizou', () => {
    const draft = normalizeImportedStudentFromDocument({ name: '', needsReview: ['name'] });
    expect(draft.needsReview.filter((f: string) => f === 'name')).toHaveLength(1);
  });

  it('não sinaliza "name" quando o nome foi encontrado', () => {
    const draft = normalizeImportedStudentFromDocument({ name: 'Evandro Silva' });
    expect(draft.needsReview).not.toContain('name');
  });
});

// ─── mergeObservationsWithRecommendations ────────────────────────────────────

describe('mergeObservationsWithRecommendations', () => {
  it('junta os dois campos quando ambos existem, rotulando a origem das recomendações', () => {
    const merged = mergeObservationsWithRecommendations('Aluno participativo.', 'Sentar próximo à lousa.');
    expect(merged).toContain('Aluno participativo.');
    expect(merged).toContain('Recomendações do documento: Sentar próximo à lousa.');
  });

  it('retorna só observações quando não há recomendações', () => {
    expect(mergeObservationsWithRecommendations('Aluno participativo.', '')).toBe('Aluno participativo.');
  });

  it('retorna só recomendações (rotuladas) quando não há observações', () => {
    expect(mergeObservationsWithRecommendations('', 'Sentar próximo à lousa.'))
      .toBe('Recomendações do documento: Sentar próximo à lousa.');
  });

  it('retorna string vazia quando nenhum dos dois existe', () => {
    expect(mergeObservationsWithRecommendations('', '')).toBe('');
  });
});

// ─── mapDocumentTextToStudentPayload ──────────────────────────────────────────

// Regra de negócio corrigida em 26/08/2026 ("consumo no momento certo"): o
// AI Gateway agora reserva, chama o provider e CONFIRMA (commit) o crédito
// atomicamente na mesma requisição, condicionado a `usabilityCheck` (array
// "students" não vazio). Por isso estas funções não recebem/retornam mais
// `reservationId` nem lançam com ele anexado — se retornam com sucesso, o
// crédito já foi definitivamente cobrado; se lançam, o próprio Gateway já
// liberou a reserva do lado do servidor antes de responder.
describe('mapDocumentTextToStudentPayload', () => {
  it('caminho feliz: identifica aluno, truncated=false para texto curto', async () => {
    callAIGatewayMock.mockResolvedValueOnce({
      result: JSON.stringify({ students: [{ name: 'Evandro Silva', grade: '5º ano', guardianName: 'Maria Silva' }] }),
    });

    const res = await mapDocumentTextToStudentPayload('Ficha de matrícula — Evandro Silva, 5º ano.');

    expect(res.drafts).toHaveLength(1);
    expect(res.drafts[0].name).toBe('Evandro Silva');
    expect(res.truncated).toBe(false);
  });

  it('envia usabilityCheck (array "students") e NÃO envia mais deferCommit — o Gateway confirma o crédito sozinho', async () => {
    callAIGatewayMock.mockResolvedValueOnce({
      result: JSON.stringify({ students: [{ name: 'Evandro Silva' }] }),
    });

    await mapDocumentTextToStudentPayload('texto qualquer');

    const sentRequest = callAIGatewayMock.mock.calls[0][0];
    expect(sentRequest.usabilityCheck).toEqual({ arrayField: 'students' });
    expect(sentRequest.deferCommit).toBeUndefined();
  });

  it('envia um operationId (idempotência) diferente a cada chamada', async () => {
    callAIGatewayMock.mockResolvedValue({ result: JSON.stringify({ students: [{ name: 'Evandro Silva' }] }) });

    await mapDocumentTextToStudentPayload('texto 1');
    await mapDocumentTextToStudentPayload('texto 2');

    const id1 = callAIGatewayMock.mock.calls[0][0].operationId;
    const id2 = callAIGatewayMock.mock.calls[1][0].operationId;
    expect(typeof id1).toBe('string');
    expect(id1.length).toBeGreaterThan(0);
    expect(id1).not.toBe(id2);
  });

  it('cadastro incompleto é aceito: diagnóstico/CID ausentes não bloqueiam a extração', async () => {
    callAIGatewayMock.mockResolvedValueOnce({
      result: JSON.stringify({ students: [{ name: 'Evandro Silva', grade: '5º ano' }] }),
    });

    const res = await mapDocumentTextToStudentPayload('Ficha de matrícula — Evandro Silva, 5º ano.');
    expect(res.drafts[0].diagnosis).toBeUndefined();
    expect(res.drafts[0].cid).toBeUndefined();
    expect(res.drafts[0].name).toBe('Evandro Silva');
  });

  it('nome ausente no documento: retorna draft para revisão manual, não descarta o documento inteiro', async () => {
    callAIGatewayMock.mockResolvedValueOnce({
      result: JSON.stringify({ students: [{ grade: '5º ano', schoolName: 'EMEF Central' }] }),
    });

    const res = await mapDocumentTextToStudentPayload('Ficha escolar sem nome legível.');
    expect(res.drafts).toHaveLength(1);
    expect(res.drafts[0].name).toBe('');
    expect(res.drafts[0].needsReview).toContain('name');
  });

  it('falha do Gateway (provider/timeout/JSON inválido/sem uso): propaga o erro sem reservationId para gerenciar — o Gateway já liberou a reserva', async () => {
    callAIGatewayMock.mockRejectedValueOnce(new Error('Nao foi possivel identificar dados utilizaveis no documento. Nenhum credito foi consumido.'));

    const err: any = await mapDocumentTextToStudentPayload('texto irrelevante').catch((e: any) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.reservationId).toBeUndefined();
  });

  it('documento longo é truncado em MAX_DOCUMENT_TEXT_CHARS antes do prompt, e truncated=true no resultado', async () => {
    callAIGatewayMock.mockResolvedValueOnce({
      result: JSON.stringify({ students: [{ name: 'Evandro Silva' }] }),
    });

    const longText = 'A'.repeat(MAX_DOCUMENT_TEXT_CHARS + 5000);
    const res = await mapDocumentTextToStudentPayload(longText);

    expect(res.truncated).toBe(true);
    const sentPrompt: string = callAIGatewayMock.mock.calls[0][0].prompt;
    // Invariante real: o texto do documento embutido no prompt é cortado em
    // MAX_DOCUMENT_TEXT_CHARS — não deve conter o texto completo (mais longo).
    // (Não comparamos mais sentPrompt.length com longText.length: o preâmbulo
    // fixo do prompt cresceu com as regras de checklist de 27/08/2026, o que
    // é esperado e não afeta o corte do texto do documento em si.)
    expect(sentPrompt).not.toContain(longText);
    expect(sentPrompt).toContain(longText.substring(0, MAX_DOCUMENT_TEXT_CHARS));
  });

  it('repassa pageInfo (páginas do PDF) para o resultado, sem alterá-lo', async () => {
    callAIGatewayMock.mockResolvedValueOnce({
      result: JSON.stringify({ students: [{ name: 'Evandro Silva' }] }),
    });

    const res = await mapDocumentTextToStudentPayload('texto', { totalPages: 8, pagesAnalyzed: 5 });
    expect(res.pageInfo).toEqual({ totalPages: 8, pagesAnalyzed: 5 });
  });
});

// ─── mapVisualDocumentToStudentPayload (imagem) ──────────────────────────────
//
// Regressão do bug real encontrado em teste manual em 26/08/2026: a leitura
// visual (PNG/JPG/WEBP) enviava task:'image' ao AI Gateway — que roteia para
// GERAÇÃO de imagem (Vertex Imagen, provider.generateImage, que nem aceita
// imageBase64) — em vez de task:'json' (análise multimodal via
// provider.generateJSON + imageBase64, o mesmo caminho que já funciona em
// mapDocumentTextToStudentPayload). Isso derrubava toda leitura de imagem com
// "Servico de imagem IA nao configurado" (CONFIG_VERTEX_IMAGE).

function makeFakeImageFile(overrides: Partial<{ type: string; name: string }> = {}) {
  return { type: 'image/png', name: 'ficha.png', ...overrides } as unknown as File;
}

describe('mapVisualDocumentToStudentPayload — imagem (PNG/JPEG/WEBP)', () => {
  it('envia task:"json" (NÃO "image") — regressão do bug real do PNG (26/08/2026)', async () => {
    callAIGatewayMock.mockResolvedValueOnce({
      result: JSON.stringify({ students: [{ name: 'Evandro Silva' }] }),
    });

    await mapVisualDocumentToStudentPayload(makeFakeImageFile());

    const sentRequest = callAIGatewayMock.mock.calls[0][0];
    expect(sentRequest.task).toBe('json');
    expect(sentRequest.task).not.toBe('image');
  });

  it('envia usabilityCheck com limite de confiança 0.25 e NÃO envia mais deferCommit', async () => {
    callAIGatewayMock.mockResolvedValueOnce({
      result: JSON.stringify({ students: [{ name: 'Evandro Silva', confidence: 0.9 }] }),
    });

    await mapVisualDocumentToStudentPayload(makeFakeImageFile());

    const sentRequest = callAIGatewayMock.mock.calls[0][0];
    expect(sentRequest.usabilityCheck).toEqual({
      arrayField: 'students',
      minAverageConfidence: 0.25,
      confidenceField: 'confidence',
    });
    expect(sentRequest.deferCommit).toBeUndefined();
  });

  it('envia um operationId (idempotência) a cada chamada', async () => {
    callAIGatewayMock.mockResolvedValueOnce({
      result: JSON.stringify({ students: [{ name: 'Evandro Silva' }] }),
    });

    await mapVisualDocumentToStudentPayload(makeFakeImageFile());

    const operationId = callAIGatewayMock.mock.calls[0][0].operationId;
    expect(typeof operationId).toBe('string');
    expect(operationId.length).toBeGreaterThan(0);
  });

  it('envia o mimetype real da imagem no imageBase64 (PNG chega como image/png, não image/jpeg)', async () => {
    callAIGatewayMock.mockResolvedValueOnce({
      result: JSON.stringify({ students: [{ name: 'Evandro Silva' }] }),
    });

    await mapVisualDocumentToStudentPayload(makeFakeImageFile({ type: 'image/png', name: 'ficha.png' }));

    const sentRequest = callAIGatewayMock.mock.calls[0][0];
    expect(sentRequest.imageBase64).toMatch(/^data:image\/png;base64,/);
  });

  it('WEBP chega com o mimetype correto', async () => {
    callAIGatewayMock.mockResolvedValueOnce({
      result: JSON.stringify({ students: [{ name: 'Evandro Silva' }] }),
    });

    await mapVisualDocumentToStudentPayload(makeFakeImageFile({ type: 'image/webp', name: 'ficha.webp' }));

    const sentRequest = callAIGatewayMock.mock.calls[0][0];
    expect(sentRequest.imageBase64).toMatch(/^data:image\/webp;base64,/);
  });

  it('caminho feliz: identifica aluno (crédito já confirmado pelo Gateway — sem reservationId a gerenciar)', async () => {
    callAIGatewayMock.mockResolvedValueOnce({
      result: JSON.stringify({ students: [{ name: 'Evandro Silva', confidence: 0.9 }] }),
    });

    const res = await mapVisualDocumentToStudentPayload(makeFakeImageFile());
    expect(res.drafts[0].name).toBe('Evandro Silva');
    expect(res.creditsConsumed).toBe(5);
  });

  it('confiança baixa (imagem ilegível): o Gateway rejeita — a função propaga o erro sem reservationId a gerenciar', async () => {
    callAIGatewayMock.mockRejectedValueOnce(
      new Error('A imagem esta ilegivel ou com qualidade insuficiente. Nenhum credito foi consumido.'),
    );

    const err: any = await mapVisualDocumentToStudentPayload(makeFakeImageFile()).catch((e: any) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.reservationId).toBeUndefined();
  });

  it('formato de imagem não suportado é rejeitado ANTES de qualquer chamada ao Gateway (nenhuma reserva criada)', async () => {
    await expect(
      mapVisualDocumentToStudentPayload(makeFakeImageFile({ type: 'image/heic', name: 'foto.heic' })),
    ).rejects.toThrow(/formato de imagem não suportado/i);
    expect(callAIGatewayMock).not.toHaveBeenCalled();
  });
});

// ─── saveStudentsFromDocx ─────────────────────────────────────────────────────

function makeDraft(overrides: Partial<EditableDraft> = {}): EditableDraft {
  return {
    name: 'Evandro Silva',
    birthDate: '',
    gender: '',
    schoolName: '',
    grade: '5º ano',
    shift: '',
    regentTeacher: '',
    aeeTeacher: '',
    coordinator: '',
    guardianName: 'Maria Silva',
    guardianPhone: '11999999999',
    guardianEmail: '',
    diagnosis: '',
    cid: '',
    supportLevel: '',
    medication: '',
    abilities: '',
    difficulties: '',
    strategies: '',
    communication: '',
    schoolHistory: '',
    familyContext: '',
    observations: '',
    recommendations: '',
    needsReview: [],
    confidence: 0.8,
    ...overrides,
  };
}

describe('saveStudentsFromDocx', () => {
  it('mescla "Recomendações" dentro de "observations" — não descarta mais silenciosamente', async () => {
    const draft = makeDraft({ observations: 'Aluno participativo.', recommendations: 'Sentar próximo à lousa.' });

    const res = await saveStudentsFromDocx([draft], 'tenant-1', 'user-1', 'docx');

    expect(res.saved).toBe(1);
    expect(res.errors).toHaveLength(0);
    const payload = saveStudentMock.mock.calls[0][0];
    expect(payload.observations).toContain('Aluno participativo.');
    expect(payload.observations).toContain('Recomendações do documento: Sentar próximo à lousa.');
  });

  it('aluno sem nome não é enviado ao banco — retorna erro claro em vez de cadastro inválido', async () => {
    const withName = makeDraft({ name: 'Evandro Silva' });
    const withoutName = makeDraft({ name: '   ' });

    const res = await saveStudentsFromDocx([withName, withoutName], 'tenant-1', 'user-1', 'docx');

    expect(res.saved).toBe(1);
    expect(saveStudentMock).toHaveBeenCalledTimes(1);
    expect(res.errors.some((e: string) => e.toLowerCase().includes('nome'))).toBe(true);
  });

  it('cadastro incompleto (sem responsável/telefone/série) ainda é salvo, marcado como incompleto', async () => {
    const draft = makeDraft({ guardianName: '', guardianPhone: '', grade: '' });

    const res = await saveStudentsFromDocx([draft], 'tenant-1', 'user-1', 'docx');

    expect(res.saved).toBe(1);
    const payload = saveStudentMock.mock.calls[0][0];
    expect(payload.registration_status).toBe('incomplete');
    expect(payload.is_pre_registered).toBe(true);
  });
});

// ─── Fidelidade de checklists (27/08/2026) ───────────────────────────────────
//
// Correção pontual: instruções explícitas nos DOIS prompts (texto e visual)
// para impedir que alternativas desmarcadas de um checklist, ou inferências
// sobre relatos de comportamento, virem "características" do aluno em
// abilities/difficulties/strategies/communication.
//
// IMPORTANTE — o que estes testes NÃO comprovam: eles verificam que o texto
// das novas regras chega ao Gateway no prompt, e que as funções puras de
// normalização/mapeamento continuam sendo passthrough fiel. Eles NÃO
// comprovam reconhecimento visual correto pelo Gemini — isso exige um teste
// manual com uma imagem real (ver roteiro no relatório desta correção).
describe('Fidelidade de checklists — prompt visual inclui as novas regras', () => {
  it('o prompt enviado contém a seção de checklists/marcações e a proibição de inferir personalidade a partir de comportamento', async () => {
    callAIGatewayMock.mockResolvedValueOnce({
      result: JSON.stringify({ students: [{ name: 'Aluno Ficticio', confidence: 0.9 }] }),
    });

    await mapVisualDocumentToStudentPayload(makeFakeImageFile());

    const sentPrompt: string = callAIGatewayMock.mock.calls[0][0].prompt;
    expect(sentPrompt).toContain('CHECKLISTS, ALTERNATIVAS E MARCAÇÕES');
    expect(sentPrompt).toContain('Alternativa SEM marcação visível não deve ser importada como característica do aluno');
    expect(sentPrompt).toContain('não transforme esse relato em "resistente", "agressivo" ou "indeciso"');
    expect(sentPrompt).toContain('SEGURANÇA DAS INSTRUÇÕES');
  });
});

describe('Fidelidade de checklists — prompt textual inclui as regras equivalentes', () => {
  it('o prompt enviado contém a seção de checklists/marcações adaptada à extração de texto (sem preservação de marcas visuais)', async () => {
    callAIGatewayMock.mockResolvedValueOnce({
      result: JSON.stringify({ students: [{ name: 'Aluno Ficticio' }] }),
    });

    await mapDocumentTextToStudentPayload('Ficha de matrícula — Aluno Ficticio, 5º ano.');

    const sentPrompt: string = callAIGatewayMock.mock.calls[0][0].prompt;
    expect(sentPrompt).toContain('CHECKLISTS, ALTERNATIVAS E MARCAÇÕES');
    expect(sentPrompt).toContain('frequentemente inclui a lista de alternativas disponíveis SEM preservar qual delas foi marcada');
    expect(sentPrompt).toContain('não transforme esse relato em "resistente", "agressivo" ou "indeciso"');
    expect(sentPrompt).toContain('SEGURANÇA DAS INSTRUÇÕES');
  });
});

describe('Fidelidade de checklists — normalização continua passthrough fiel (sem dicionário/inferência)', () => {
  it('campos vazios/ausentes permanecem vazios (não geram etiqueta nenhuma)', () => {
    const withEmptyArrays = normalizeImportedStudentFromDocument({ name: 'X', abilities: [], difficulties: [] });
    expect(withEmptyArrays.abilities).toBeUndefined();
    expect(withEmptyArrays.difficulties).toBeUndefined();

    const withMissingFields = normalizeImportedStudentFromDocument({ name: 'X' });
    expect(withMissingFields.abilities).toBeUndefined();
    expect(withMissingFields.difficulties).toBeUndefined();
  });

  it('característica explicitamente recebida da IA é preservada tal como veio', () => {
    const draft = normalizeImportedStudentFromDocument({ name: 'X', abilities: ['Grato', 'Paciente'] });
    expect(draft.abilities).toEqual(['Grato', 'Paciente']);
  });

  it('um relato comportamental isolado não gera nenhuma outra etiqueta no código (a inferência, se houver, teria que vir da IA — não do parser)', () => {
    const draft = normalizeImportedStudentFromDocument({
      name: 'X',
      difficulties: ['Fica muito brava quando contrariada'],
    });
    expect(draft.difficulties).toEqual(['Fica muito brava quando contrariada']);
    expect(draft.abilities).toBeUndefined();
    expect(draft.diagnosis).toBeUndefined();
    expect(draft.supportLevel).toBeUndefined();
  });

  it('duas importações consecutivas não compartilham abilities/difficulties entre si', async () => {
    const draftA = makeDraft({ name: 'Aluno A', abilities: 'Curiosa\nContente', difficulties: 'Indecisão\nResistente' });
    await saveStudentsFromDocx([draftA], 'tenant-1', 'user-1', 'pdf-image');
    expect(saveStudentMock.mock.calls[0][0].abilities).toEqual(['Curiosa', 'Contente']);

    saveStudentMock.mockClear();

    const draftB = makeDraft({ name: 'Aluno B', abilities: '', difficulties: '' });
    await saveStudentsFromDocx([draftB], 'tenant-1', 'user-1', 'pdf-image');
    const payloadB = saveStudentMock.mock.calls[0][0];
    expect(payloadB.abilities).toEqual([]);
    expect(payloadB.difficulties).toEqual([]);
  });

  it('documento incompleto (sem habilidades/dificuldades) continua sendo salvo normalmente — não é motivo de rejeição', async () => {
    const draft = makeDraft({ name: 'Aluno Incompleto', abilities: '', difficulties: '' });
    const res = await saveStudentsFromDocx([draft], 'tenant-1', 'user-1', 'pdf-image');
    expect(res.saved).toBe(1);
    expect(res.errors).toHaveLength(0);
  });

  it('documento sem nome mantém o comportamento existente (needsReview, sem descarte) mesmo após a mudança no prompt', () => {
    const draft = normalizeImportedStudentFromDocument({ grade: '5º ano' });
    expect(draft.name).toBe('');
    expect(draft.needsReview).toContain('name');
  });
});

describe('Fidelidade de checklists — leitura multipágina, numeração e custo permanecem intocados', () => {
  it('images, pageNumbers, usabilityCheck e creditsRequired continuam exatamente como antes da mudança de prompt', async () => {
    callAIGatewayMock.mockResolvedValueOnce({
      result: JSON.stringify({ students: [{ name: 'Aluno Ficticio', confidence: 0.9 }] }),
    });

    await mapVisualDocumentToStudentPayload(makeFakeImageFile());

    const sentRequest = callAIGatewayMock.mock.calls[0][0];
    expect(sentRequest.task).toBe('json');
    expect(sentRequest.creditsRequired).toBe(CREDITS_VISUAL);
    expect(sentRequest.usabilityCheck).toEqual({
      arrayField: 'students',
      minAverageConfidence: 0.25,
      confidenceField: 'confidence',
    });
    // Imagem única: sem `images`/`pageNumbers` (comportamento de sempre para PNG/JPEG/WEBP).
    expect(sentRequest.images).toBeUndefined();
    expect(sentRequest.pageNumbers).toBeUndefined();
  });
});

describe('Fidelidade de checklists — exemplos citados nas instruções não vazam para o draft', () => {
  it('palavras usadas como EXEMPLO nas novas regras do prompt (curioso/indeciso/resistente/agressivo) não aparecem no draft quando a IA não as devolveu', async () => {
    callAIGatewayMock.mockResolvedValueOnce({
      // Resposta simulada da IA — deliberadamente SEM nenhuma das palavras de
      // exemplo citadas nas instruções do prompt, para garantir que elas não
      // "vazam" do prompt para o resultado por engano de parsing.
      result: JSON.stringify({ students: [{ name: 'Aluno Ficticio', abilities: ['Grato'], confidence: 0.9 }] }),
    });

    const res = await mapVisualDocumentToStudentPayload(makeFakeImageFile());

    const exemplosDoPrompt = ['curioso', 'contente', 'indeciso', 'resistente', 'agressivo'];
    const abilitiesLower = (res.drafts[0].abilities ?? []).map((s: string) => s.toLowerCase());
    for (const exemplo of exemplosDoPrompt) {
      expect(abilitiesLower).not.toContain(exemplo);
    }
    expect(res.drafts[0].abilities).toEqual(['Grato']);
  });
});
