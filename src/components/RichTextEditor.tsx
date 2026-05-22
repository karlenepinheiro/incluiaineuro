// components/RichTextEditor.tsx
// WYSIWYG rich-text editor for long document fields (PEI, PAEE, Estudo de Caso)
// Uses contenteditable + execCommand — no extra dependency.
// Mirrors AudioEnhancedTextarea for mic + suggestion chips.
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Bold, Italic, Underline, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Eraser, Mic, Square, AlertCircle, Plus, ChevronDown, ChevronUp,
} from 'lucide-react';

// ── Inject placeholder + list styles once ────────────────────────────────────
if (typeof document !== 'undefined') {
  const STYLE_ID = 'rich-editor-global-styles';
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.rich-editor:empty::before{content:attr(data-placeholder);color:#9ca3af;pointer-events:none;display:block}',
      '.rich-editor h1{font-size:1.2rem;font-weight:700;margin:.2rem 0}',
      '.rich-editor h2{font-size:1.05rem;font-weight:700;margin:.2rem 0}',
      '.rich-editor ul{list-style:disc;padding-left:1.4rem}',
      '.rich-editor ol{list-style:decimal;padding-left:1.4rem}',
      '.rich-editor li{margin:.1rem 0}',
    ].join('');
    document.head.appendChild(s);
  }
}

// ── Suggestion chips (mirrors AudioEnhancedTextarea) ─────────────────────────
const SUGGESTIONS: Record<string, string[]> = {
  comportamento: [
    'Apresenta comportamento adequado para a faixa etária na maior parte do tempo.',
    'Demonstra dificuldade em regular o comportamento em situações de transição.',
    'Interage de forma positiva com colegas quando mediado pelo adulto.',
    'Apresenta episódios de agitação que interferem nas atividades coletivas.',
  ],
  aprendizagem: [
    'Demonstra evolução consistente nas habilidades trabalhadas.',
    'Responde bem a atividades com suporte visual e repetição estruturada.',
    'Apresenta avanços pontuais mas ainda necessita de apoio intenso.',
    'Consegue generalizar aprendizados para novos contextos com apoio.',
  ],
  estrategias: [
    'Foram utilizadas pistas visuais, antecipação de rotina e reforço positivo.',
    'Aplicou-se redução do número de itens por atividade e tempo ampliado.',
    'Uso de CAA (Comunicação Aumentativa e Alternativa) e objetos concretos.',
    'Parceria com colega tutor e atividades em pequenos grupos.',
  ],
  encaminhamentos: [
    'Encaminhar para avaliação neuropsicológica externa.',
    'Acionar psicólogo escolar para acompanhamento complementar.',
    'Convocar reunião com família para alinhamento das estratégias em casa.',
    'Articular com AEE para revisão das metas do PEI.',
  ],
  relato_familia: [
    'A família relata que o aluno apresenta comportamento semelhante em casa.',
    'Os responsáveis observam dificuldades nas atividades de rotina diária.',
    'A família demonstra comprometimento e participação ativa no processo.',
    'Relatam progressos observados desde o início do acompanhamento.',
  ],
  preocupacoes: [
    'A família demonstra preocupação com as dificuldades de socialização.',
    'Questionam o ritmo de aprendizagem em comparação aos colegas.',
    'Preocupação com crises emocionais frequentes fora do ambiente escolar.',
    'Incerteza sobre o diagnóstico e os próximos encaminhamentos.',
  ],
  acordo: [
    'Foi acordado que a família manterá rotina previsível em casa.',
    'Comprometimento em garantir presença nas sessões do AEE.',
    'A família se comprometeu a comunicar qualquer mudança relevante.',
    'Próxima reunião de acompanhamento agendada conforme disponibilidade.',
  ],
  descricao_at: [
    'Durante o atendimento, foram trabalhadas habilidades de atenção e memória.',
    'Atividades lúdicas estruturadas com foco em comunicação funcional.',
    'Jogos de sequência, pareamento e categorização com apoio concreto.',
    'Exercícios de coordenação motora fina com adaptações de material.',
  ],
  evolucao_obs: [
    'O aluno demonstrou evolução significativa na comunicação expressiva.',
    'Observa-se maior tempo de atenção sustentada nas atividades propostas.',
    'Redução de episódios de recusa e aumento da participação voluntária.',
    'Progresso nas habilidades motoras finas, ainda com necessidade de apoio.',
  ],
  recursos: [
    'Foram utilizados como recursos: prancha de comunicação, cartões visuais e timer visual.',
    'Material concreto adaptado, tecnologia assistiva (tablet com CAA) e mobiliário adaptado.',
    'Jogos sensoriais, bolas de textura e almofadas de posicionamento.',
    'Softwares educativos acessíveis e livros com pictogramas.',
  ],
  comunicacao: [
    'A articulação com o professor regente ocorre semanalmente de forma sistemática.',
    'Há troca regular de informações sobre estratégias e adaptações em sala.',
    'O professor regente tem implementado as orientações do AEE com êxito.',
    'A comunicação precisa ser fortalecida — sugere-se encontros quinzenais.',
  ],
  diagnostico_equipe: [
    'A equipe concluiu que o aluno necessita de avaliação especializada externa.',
    'Há indícios de necessidade de AEE com suporte de nível 2.',
    'O perfil observado é compatível com as características descritas no diagnóstico.',
    'A equipe recomenda manutenção do acompanhamento com revisão trimestral.',
  ],
  justificativa: [
    'A decisão se justifica pelo fato de o aluno não ter apresentado evolução esperada.',
    'Fundamentada nas avaliações periódicas e na análise do histórico escolar.',
    'Alinhada às normativas da política de educação inclusiva vigente.',
    'Baseada no consenso da equipe multiprofissional após análise dos dados.',
  ],
  proximos_passos: [
    'Como próximos passos, a equipe deve revisar as metas do PEI no próximo bimestre.',
    'Acionar a rede de apoio externa e aguardar retorno dos encaminhamentos.',
    'Realizar nova reunião de acompanhamento em 30 dias.',
    'Comunicar a família sobre a decisão e os encaminhamentos acordados.',
  ],
  metas_atingidas: [
    'As seguintes metas foram atingidas: identificação de cores, sequência de rotina e comunicação de necessidades básicas.',
    'Concluiu-se a meta de permanência na sala por tempo integral.',
    'O aluno atingiu a meta de interação com pelo menos 2 colegas por sessão.',
    'Meta de escrita do próprio nome concluída com apoio mínimo.',
  ],
  metas_andamento: [
    'As seguintes metas estão em desenvolvimento: leitura de palavras simples e operações básicas.',
    'Em andamento: uso independente da CAA para expressar preferências.',
    'Trabalhando o controle de impulsos e autorregulação emocional.',
    'Meta de cópia de textos curtos ainda em processo de consolidação.',
  ],
  ajustes: [
    'Recomenda-se ajustar o tempo de execução das atividades para intervalos menores.',
    'Revisar as metas — algumas estão além do nível atual de desenvolvimento.',
    'Incluir mais atividades de reforço positivo e pausas sensoriais.',
    'Adaptar os materiais com apoio visual mais robusto.',
  ],
  comunicado_familia: [
    'A família foi informada sobre os avanços observados no período.',
    'Comunicados os próximos encaminhamentos e a importância da participação familiar.',
    'Orientada sobre estratégias a serem replicadas em casa.',
    'Informada sobre a revisão das metas e os novos objetivos do AEE.',
  ],
  motivo: [
    'Apresenta dificuldades persistentes de aprendizagem que requerem avaliação especializada.',
    'Observou-se necessidade de avaliação multiprofissional para melhor compreensão do caso.',
    'Demonstra comportamentos que impactam seu desempenho escolar e social.',
    'Necessita de suporte especializado além do oferecido pela escola regular.',
  ],
  observacoes: [
    'A equipe observou que o aluno apresenta potencial a ser desenvolvido com apoio adequado.',
    'Durante o acompanhamento, foram identificadas estratégias eficazes que devem ser mantidas.',
    'Ressalta-se a importância da parceria família-escola para o sucesso do processo.',
    'Demais informações relevantes foram registradas no dossiê do aluno.',
  ],
  evolucao: [
    'Durante o período, o aluno demonstrou avanços significativos nas habilidades trabalhadas.',
    'Observou-se melhora na comunicação, socialização e participação nas atividades.',
    'O aluno consolidou as metas propostas e está pronto para novas etapas.',
    'O desenvolvimento foi gradual e consistente com o suporte oferecido.',
  ],
  recomendacoes: [
    'Recomenda-se que a família mantenha as rotinas estruturadas em casa.',
    'Continuar o acompanhamento terapêutico externo conforme indicação profissional.',
    'Revisitar periodicamente as estratégias utilizadas e adaptar conforme necessidade.',
    'Manter comunicação regular entre escola, família e profissionais externos.',
  ],
  observacoes_equipe: [
    'Durante o acompanhamento, a equipe observou avanços consistentes.',
    'Identificou-se a necessidade de revisão das estratégias no próximo período.',
    'A equipe recomenda a continuidade do trabalho colaborativo entre todos os envolvidos.',
    'Registros detalhados foram mantidos no prontuário do aluno.',
  ],
  sintese: [
    'Em síntese, o aluno apresentou desenvolvimento compatível com as intervenções realizadas.',
    'O período foi marcado por conquistas significativas e algumas limitações a serem trabalhadas.',
    'A síntese aponta para a necessidade de continuidade e aprofundamento das estratégias.',
  ],
};

function getChips(fieldId: string, customChips?: string[]): string[] {
  if (customChips !== undefined) return customChips;
  if (SUGGESTIONS[fieldId]) return SUGGESTIONS[fieldId];
  const suffix = fieldId.includes('_') ? fieldId.split('_').pop()! : fieldId;
  const keys = Object.keys(SUGGESTIONS);
  const match = keys.find(k => k.startsWith(suffix) || suffix.startsWith(k) || k.includes(suffix));
  if (match) return SUGGESTIONS[match];
  return SUGGESTIONS.observacoes_equipe;
}

// ── HTML sanitizer ────────────────────────────────────────────────────────────
const ALLOWED_TAGS = new Set([
  'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li',
  'p', 'div', 'span', 'br', 'h1', 'h2',
]);

function sanitize(html: string): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(normalizeMarkdownToHtml(html), 'text/html');

  function walk(src: Node, dst: Element): void {
    for (const child of Array.from(src.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        dst.appendChild(document.createTextNode(child.textContent ?? ''));
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as Element;
        const tag = el.tagName.toLowerCase();
        if (ALLOWED_TAGS.has(tag)) {
          const ne = document.createElement(tag);
          const style = el.getAttribute('style') ?? '';
          const m = style.match(/text-align\s*:\s*(left|center|right|justify)/i);
          if (m) ne.setAttribute('style', `text-align:${m[1]}`);
          walk(el, ne);
          dst.appendChild(ne);
        } else {
          walk(el, dst);
        }
      }
    }
  }

  const out = document.createElement('div');
  walk(doc.body, out);
  return out.innerHTML;
}

function escText(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function convertInlineMarkdown(text: string): string {
  return escText(text)
    .replace(/\*\*([^*\n]*[A-Za-zÀ-ÿ][^*\n]*)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]*[A-Za-zÀ-ÿ][^_\n_]*)__/g, '<strong>$1</strong>')
    .replace(/(^|[\s([{"'“])\*([^*\n]*[A-Za-zÀ-ÿ][^*\n]*)\*(?=$|[\s)\].,;:!?"'”}])/g, '$1<em>$2</em>')
    .replace(/(^|[\s([{"'“])_([^_\n]*[A-Za-zÀ-ÿ][^_\n]*)_(?=$|[\s)\].,;:!?"'”}])/g, '$1<em>$2</em>');
}

function normalizeMarkdownToHtml(input: string): string {
  if (!input) return '';

  const looksLikeHtml = /<[a-z][\s\S]*>/i.test(input);
  if (looksLikeHtml) {
    const doc = new DOMParser().parseFromString(input, 'text/html');
    const walker = document.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    for (const node of nodes) {
      const value = node.textContent ?? '';
      if (!/(\*\*|__|(^|[\s([{"'“])[*_][^*_]+[*_])/m.test(value)) continue;
      const template = document.createElement('template');
      template.innerHTML = convertInlineMarkdown(value);
      node.replaceWith(template.content);
    }
    return doc.body.innerHTML;
  }

  const lines = input.replace(/\r\n?/g, '\n').split('\n');
  const parts: string[] = [];
  let list: string[] = [];
  const flushList = () => {
    if (!list.length) return;
    parts.push(`<ul>${list.map(item => `<li>${convertInlineMarkdown(item)}</li>`).join('')}</ul>`);
    list = [];
  };

  for (const line of lines) {
    const item = line.match(/^\s*[-*]\s+(.+)$/);
    if (item) {
      list.push(item[1]);
      continue;
    }
    flushList();
    parts.push(convertInlineMarkdown(line));
  }
  flushList();
  return parts.join('<br>');
}

// ── Sub-components ────────────────────────────────────────────────────────────
const ToolBtn: React.FC<{
  title: string;
  onMouseDown: (e: React.MouseEvent) => void;
  children?: React.ReactNode;
  label?: string;
}> = ({ title, onMouseDown, children, label }) => (
  <button
    type="button"
    title={title}
    onMouseDown={onMouseDown}
    className="p-1.5 rounded hover:bg-gray-200 text-gray-600 hover:text-gray-800 transition text-xs font-bold leading-none select-none"
  >
    {children ?? label}
  </button>
);

const Sep: React.FC = () => (
  <div className="w-px h-4 bg-gray-300 mx-0.5 self-center" />
);

// ── Main component ────────────────────────────────────────────────────────────
export interface RichTextEditorProps {
  fieldId?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  suggestionChips?: string[];
  rows?: number;
}

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  fieldId = 'general',
  value,
  onChange,
  placeholder = 'Digite ou clique em "Gravar áudio" para transcrever...',
  suggestionChips,
  rows = 5,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [audioError, setAudioError] = useState('');
  const [showAllChips, setShowAllChips] = useState(false);

  const editorRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const lastEmittedRef = useRef(value);

  const hasRecognition = !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  const chips = useMemo(() => getChips(fieldId, suggestionChips), [fieldId, suggestionChips]);
  const visibleChips = showAllChips ? chips : chips.slice(0, 3);

  // Sync external value → editor when NOT focused (avoids cursor jump while typing)
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const s = sanitize(value);
    // On mount: always set. While focused: skip (user is typing).
    if (document.activeElement !== el || el.innerHTML === '') {
      if (el.innerHTML !== s) {
        el.innerHTML = s;
        lastEmittedRef.current = value;
      }
    }
  }, [value]);

  const emit = useCallback((html: string) => {
    lastEmittedRef.current = html;
    onChange(html);
  }, [onChange]);

  const handleInput = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    emit(sanitize(el.innerHTML));
  }, [emit]);

  // execCommand wrapper: preventDefault keeps focus in contenteditable
  const cmd = useCallback((c: string, a?: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    document.execCommand(c, false, a);
    const el = editorRef.current;
    if (el) emit(sanitize(el.innerHTML));
  }, [emit]);

  // Append plain text at end of editor (for chips and audio)
  const appendToEditor = useCallback((text: string) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sep = el.innerHTML.trim() ? '<br>' : '';
    const newHtml = sanitize(el.innerHTML + sep + escText(text));
    el.innerHTML = newHtml;
    // Move cursor to end
    try {
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(el);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    } catch (_) { /* ignore */ }
    emit(newHtml);
  }, [emit]);

  // ── Audio recording ─────────────────────────────────────────────────────────
  const startRecording = () => {
    setAudioError('');
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setAudioError('Reconhecimento de voz não suportado. Use Google Chrome.');
      return;
    }

    const baseHtml = editorRef.current?.innerHTML ?? '';
    const rec = new SR();
    rec.lang = 'pt-BR';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    let finalAccum = '';

    rec.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) { finalAccum += t + ' '; interim = ''; }
        else { interim += t; }
      }
      setInterimText(interim);
      if (finalAccum.trim()) {
        const el = editorRef.current;
        if (el) {
          const sep = baseHtml.trim() ? '<br>' : '';
          const newHtml = sanitize(baseHtml + sep + escText(finalAccum.trim()));
          el.innerHTML = newHtml;
          emit(newHtml);
        }
      }
    };

    rec.onerror = (e: any) => {
      if (e.error !== 'no-speech') {
        setAudioError(`Erro: ${e.error === 'not-allowed' ? 'permissão negada' : e.error}`);
      }
      stopRecording();
    };

    rec.onend = () => { setIsRecording(false); setInterimText(''); };
    rec.start();
    recognitionRef.current = rec;
    setIsRecording(true);
  };

  const stopRecording = () => {
    recognitionRef.current?.stop();
    setIsRecording(false);
    setInterimText('');
  };

  useEffect(() => () => recognitionRef.current?.stop(), []);

  // ── Render ──────────────────────────────────────────────────────────────────
  const minH = `${rows * 1.75}rem`;

  return (
    <div className="space-y-1.5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-1.5 py-1 bg-gray-50 border border-gray-200 rounded-t-lg">
        <ToolBtn title="Negrito (Ctrl+B)" onMouseDown={cmd('bold')}><Bold size={13} /></ToolBtn>
        <ToolBtn title="Itálico (Ctrl+I)" onMouseDown={cmd('italic')}><Italic size={13} /></ToolBtn>
        <ToolBtn title="Sublinhado (Ctrl+U)" onMouseDown={cmd('underline')}><Underline size={13} /></ToolBtn>
        <Sep />
        <ToolBtn title="Lista com marcadores" onMouseDown={cmd('insertUnorderedList')}><List size={13} /></ToolBtn>
        <ToolBtn title="Lista numerada" onMouseDown={cmd('insertOrderedList')}><ListOrdered size={13} /></ToolBtn>
        <Sep />
        <ToolBtn title="Alinhar à esquerda" onMouseDown={cmd('justifyLeft')}><AlignLeft size={13} /></ToolBtn>
        <ToolBtn title="Centralizar" onMouseDown={cmd('justifyCenter')}><AlignCenter size={13} /></ToolBtn>
        <ToolBtn title="Alinhar à direita" onMouseDown={cmd('justifyRight')}><AlignRight size={13} /></ToolBtn>
        <ToolBtn title="Justificar" onMouseDown={cmd('justifyFull')}><AlignJustify size={13} /></ToolBtn>
        <Sep />
        <ToolBtn title="Título grande" onMouseDown={cmd('formatBlock', 'h1')} label="H1" />
        <ToolBtn title="Título médio" onMouseDown={cmd('formatBlock', 'h2')} label="H2" />
        <Sep />
        <ToolBtn title="Limpar formatação" onMouseDown={cmd('removeFormat')}><Eraser size={13} /></ToolBtn>

        {/* Audio button — right-aligned */}
        <div className="ml-auto flex items-center">
          {hasRecognition ? (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); isRecording ? stopRecording() : startRecording(); }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition select-none ${
                isRecording
                  ? 'bg-red-100 text-red-700 animate-pulse'
                  : 'bg-gray-100 text-gray-600 hover:bg-[#1F4E5F]/10 hover:text-[#1F4E5F]'
              }`}
            >
              {isRecording ? <><Square size={10} /> Parar</> : <><Mic size={10} /> Gravar áudio</>}
            </button>
          ) : (
            <span className="text-[10px] text-gray-400 flex items-center gap-1">
              <AlertCircle size={10} /> Chrome only
            </span>
          )}
        </div>
      </div>

      {/* Contenteditable editor */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        className={`w-full border border-t-0 rounded-b-xl px-3 py-2.5 text-sm focus:outline-none overflow-auto bg-white rich-editor ${
          isRecording
            ? 'border-red-300 ring-2 ring-red-100 ring-offset-0'
            : 'border-gray-200 focus:ring-2 focus:ring-[#1F4E5F]/25 focus:border-[#1F4E5F]/50'
        }`}
        style={{ minHeight: minH }}
        data-placeholder={placeholder}
      />

      {/* Recording status */}
      {isRecording && (
        <p className="text-xs text-red-600 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
          Gravando... fale claramente. Clique em "Parar" ao terminar.
          {interimText && <span className="text-gray-400 italic ml-1">{interimText}</span>}
        </p>
      )}

      {/* Audio error */}
      {audioError && (
        <p className="text-xs text-red-500 flex items-center gap-1">
          <AlertCircle size={11} /> {audioError}
        </p>
      )}

      {/* Suggestion chips */}
      {chips.length > 0 && (
        <div className="space-y-1">
          <div className="flex flex-wrap gap-1.5">
            {visibleChips.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => appendToEditor(chip)}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] bg-[#F6F4EF] hover:bg-[#1F4E5F]/10 border border-[#E7E2D8] rounded-lg text-gray-600 hover:text-[#1F4E5F] transition"
                title={chip}
              >
                <Plus size={10} />
                {chip.length > 40 ? chip.slice(0, 40) + '…' : chip}
              </button>
            ))}
          </div>
          {chips.length > 3 && (
            <button
              type="button"
              onClick={() => setShowAllChips(v => !v)}
              className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-[#1F4E5F] transition"
            >
              {showAllChips
                ? <><ChevronUp size={10} /> Menos sugestões</>
                : <><ChevronDown size={10} /> +{chips.length - 3} sugestões</>}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default RichTextEditor;
