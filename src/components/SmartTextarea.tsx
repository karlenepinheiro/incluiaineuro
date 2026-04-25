import React, { useMemo, useRef, useState } from 'react';
import { Plus, AlertTriangle, Mic, Square, Sparkles } from 'lucide-react';

export type SmartContext = 'cognitive' | 'social' | 'motor' | 'general' | 'leitura' | 'escrita' | 'compreensao' | 'autonomia' | 'atencao' | 'raciocinio';

interface Props {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  rows?: number;
  context?: SmartContext;
  disabled?: boolean;
  score?: number;
  onSuggestAI?: () => void;
  isGeneratingAI?: boolean;
}

const getQuickBlocks = (ctx: SmartContext, score?: number): string[] => {
  if (ctx === 'leitura') {
    if (!score || score <= 2) return ["Ainda não reconhece as letras do alfabeto.", "Apresenta dificuldade na junção silábica.", "Necessita de apoio visual e mediação constante.", "Lê apenas palavras memorizadas (global)."];
    if (score === 3) return ["Lê palavras simples, mas com lentidão.", "Compreende frases curtas com apoio.", "Reconhece a maioria das sílabas simples.", "Apresenta leitura silabada."];
    return ["Lê textos curtos com autonomia e fluência.", "Compreende o que lê sem necessidade de apoio.", "Respeita pontuação básica durante a leitura.", "Capaz de inferir informações implícitas."];
  }
  if (ctx === 'escrita') {
    if (!score || score <= 2) return ["Encontra-se na fase pré-silábica.", "Dificuldade na preensão do lápis (motricidade fina).", "Realiza garatujas sem valor sonoro.", "Necessita de alfabeto móvel ou cópia."];
    if (score === 3) return ["Encontra-se na fase silábico-alfabética.", "Escreve palavras com alguns erros ortográficos.", "Consegue copiar do quadro com lentidão.", "Produz frases curtas com apoio estrutural."];
    return ["Escrita alfabética consolidada.", "Produz pequenos textos de forma autônoma.", "Letra legível e com bom espaçamento.", "Demonstra coerência e coesão na escrita."];
  }
  if (ctx === 'compreensao') {
    if (!score || score <= 2) return ["Dificuldade em compreender comandos simples.", "Necessita de instruções passo a passo.", "Responde melhor a comandos rotineiros.", "Apresenta respostas desconexas em diálogos."];
    if (score === 3) return ["Compreende comandos diretos e rotineiros.", "Instruções complexas precisam ser divididas.", "Relata fatos recentes com mediação.", "Pode se perder em explicações muito longas."];
    return ["Compreende comandos complexos e sequenciais.", "Participa de debates e expressa opiniões.", "Boa compreensão de narrativas e histórias.", "Entende linguagem figurada e ironia simples."];
  }
  if (ctx === 'autonomia') {
    if (!score || score <= 2) return ["Depende de mediação física para AVDs.", "Não se organiza com seus materiais.", "Dificuldade para ir ao banheiro/alimentar-se.", "Necessita de direcionamento para iniciar tarefas."];
    if (score === 3) return ["Realiza rotinas com supervisão mínima.", "Guarda o material quando solicitado.", "Pede ajuda quando encontra dificuldades.", "Inicia tarefas, mas precisa de lembretes."];
    return ["Totalmente independente nas AVDs escolares.", "Organiza seu material e espaço de trabalho.", "Toma iniciativa em atividades propostas.", "Auxilia os colegas em tarefas de rotina."];
  }
  if (ctx === 'atencao') {
    if (!score || score <= 2) return ["Atenção muito volátil e dispersa.", "Dificuldade severa em manter o foco.", "Levanta-se constantemente da cadeira.", "Distrai-se facilmente com estímulos externos."];
    if (score === 3) return ["Mantém o foco por curtos períodos (10-15 min).", "Necessita de redirecionamento ocasional.", "Foca melhor em atividades de seu interesse.", "Apresenta inquietação motora leve."];
    return ["Boa capacidade de atenção sustentada.", "Conclui tarefas longas sem se dispersar.", "Foca mesmo em ambientes com distratores.", "Retoma a concentração rapidamente após interrupção."];
  }
  if (ctx === 'raciocinio') {
    if (!score || score <= 2) return ["Dificuldade em estabelecer causa e efeito.", "Não reconhece números ou quantidades.", "Precisa de material concreto para tudo.", "Dificuldade em classificar e seriar."];
    if (score === 3) return ["Realiza operações simples com apoio concreto.", "Compreende sequência lógica cotidiana.", "Resolve problemas matemáticos com mediação.", "Consegue classificar por cor, forma e tamanho."];
    return ["Bom raciocínio lógico-matemático.", "Resolve problemas complexos para a idade.", "Realiza cálculo mental com facilidade.", "Compreende regras de jogos rapidamente."];
  }
  
  const FALLBACK_BLOCKS: Record<string, string[]> = {
    cognitive: ["Melhorar o tempo de atenção sustentada.", "Desenvolver raciocínio lógico-matemático.", "Estimular a memória de curto prazo.", "Trabalhar a compreensão de comandos simples."],
    social: ["Incentivar a interação com colegas e adultos.", "Trabalhar habilidades de comunicação funcional.", "Estimular turnos de fala e espera.", "Promover autorregulação emocional."],
    motor: ["Desenvolver coordenação motora fina.", "Estimular coordenação motora ampla.", "Trabalhar lateralidade e noção espacial.", "Aprimorar preensão e controle do lápis."],
    general: ["Garantir rotina previsível e instruções objetivas.", "Oferecer suporte visual e reforço positivo.", "Adaptar materiais e tempo de execução.", "Registrar evidências e avanços observáveis."],
  };
  
  return FALLBACK_BLOCKS[ctx] ?? FALLBACK_BLOCKS.general;
};

export const SmartTextarea: React.FC<Props> = ({
  value,
  onChange,
  placeholder,
  rows = 4,
  context = 'general',
  disabled = false,
  score,
  onSuggestAI,
  isGeneratingAI = false,
}) => {
  const blocks = getQuickBlocks(context, score);

  const addBlock = (text: string) => {
    const next = (value || '').trim();
    const glued = next.length ? `${next}\n- ${text}` : `- ${text}`;
    onChange(glued);
  };

  
  // --- Speech-to-text (Web Speech API) ---
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const canSpeech = useMemo(() => {
    const w: any = window as any;
    return typeof w !== 'undefined' && !!(w.SpeechRecognition || w.webkitSpeechRecognition);
  }, []);

  const startSpeech = () => {
    if (!canSpeech || disabled) return;
    const w: any = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = 'pt-BR';
    rec.continuous = true;
    rec.interimResults = true;

    let finalText = '';
    rec.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += transcript + ' ';
        else interim += transcript;
      }
      // Update textarea live (append)
      const base = (value || '').trim();
      const next = (base ? base + ' ' : '') + (finalText + interim).trim();
      onChange(next);
    };
    rec.onerror = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    rec.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  };

  const stopSpeech = () => {
    try { recognitionRef.current?.stop?.(); } catch {}
    setListening(false);
    recognitionRef.current = null;
  };

return (
    <div className="space-y-2">
      <div className="relative">
        {/* Controles de Topo: IA e Microfone */}
        <div className="absolute right-2 top-2 flex items-center gap-2">
          {onSuggestAI && (
            <button
              type="button"
              onClick={onSuggestAI}
              disabled={disabled || isGeneratingAI}
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-bold border transition-colors ${
                (disabled || isGeneratingAI) ? "opacity-50 cursor-not-allowed border-gray-200 text-gray-500" : "border-[#1F4E5F]/30 text-[#1F4E5F] bg-[#1F4E5F]/5 hover:bg-[#1F4E5F]/10"
              }`}
              title="Sugerir texto com IA"
            >
              <Sparkles className="h-3 w-3" />
              {isGeneratingAI ? "Gerando..." : "Sugerir com IA"}
            </button>
          )}
          <button
            type="button"
            onClick={() => (listening ? stopSpeech() : startSpeech())}
            disabled={!canSpeech || disabled}
            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-bold border transition-colors ${(!canSpeech || disabled) ? "opacity-40 cursor-not-allowed border-gray-200 text-gray-500" : listening ? "border-red-300 text-red-700 bg-red-50" : "border-gray-200 text-gray-700 hover:bg-gray-50"}`}
            title={canSpeech ? (listening ? "Parar gravação" : "Transcrever por voz") : "Seu navegador não suporta transcrição"}
          >
            {listening ? <Square className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
            {listening ? "Gravando..." : "Microfone"}
          </button>
        </div>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
          className={`w-full p-3 pt-12 border rounded-lg resize-none focus:ring-2 focus:ring-[#1F4E5F]/50 focus:border-transparent ${
            disabled ? 'bg-gray-50 text-gray-500' : ''
          }`}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {blocks.map((b, idx) => (
          <button
            key={`${context}-${idx}`}
            type="button"
            disabled={disabled}
            onClick={() => addBlock(b)}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-[#1F4E5F] bg-[#F4F8FD] hover:bg-[#E2E8F0] border border-[#E5E7EB] rounded-md disabled:opacity-50 transition-colors"
            title="Adicionar sugestão"
          >
            <Plus size={12} /> {b}
          </button>
        ))}
      </div>

      <div className="flex items-start gap-2 text-[11px] text-gray-500">
        <AlertTriangle size={14} className="mt-0.5" />
        <span>
          Dica: use as sugestões para ganhar tempo. Se o campo tiver áudio habilitado, o botão de gravação
          aparece <b>apenas</b> no gravador do campo (evita duplicar controles).
        </span>
      </div>
    </div>
  );
};