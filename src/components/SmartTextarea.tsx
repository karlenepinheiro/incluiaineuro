import React, { useMemo, useRef, useState } from 'react';
import { Plus, AlertTriangle, Mic, Square } from 'lucide-react';

interface Props {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  rows?: number;
  context?: 'cognitive' | 'social' | 'motor' | 'general';
  disabled?: boolean;
}

const QUICK_BLOCKS: Record<NonNullable<Props['context']>, string[]> = {
  cognitive: [
    "Melhorar o tempo de atenção sustentada.",
    "Desenvolver raciocínio lógico-matemático.",
    "Estimular a memória de curto prazo.",
    "Trabalhar a compreensão de comandos simples e sequenciais.",
  ],
  social: [
    "Incentivar a interação com colegas e adultos.",
    "Trabalhar habilidades de comunicação funcional.",
    "Estimular turnos de fala e espera.",
    "Promover autorregulação emocional em situações de frustração.",
  ],
  motor: [
    "Desenvolver coordenação motora fina (recorte, colagem, traçado).",
    "Estimular coordenação motora ampla (equilíbrio e deslocamento).",
    "Trabalhar lateralidade e noção espacial.",
    "Aprimorar preensão e controle do lápis.",
  ],
  general: [
    "Garantir rotina previsível e instruções objetivas.",
    "Oferecer suporte visual e reforço positivo.",
    "Adaptar materiais e tempo de execução.",
    "Registrar evidências e avanços observáveis.",
  ],
};

export const SmartTextarea: React.FC<Props> = ({
  value,
  onChange,
  placeholder,
  rows = 4,
  context = 'general',
  disabled = false,
}) => {
  const blocks = QUICK_BLOCKS[context] ?? QUICK_BLOCKS.general;

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
        {/* Speech-to-text */}
        <button
          type="button"
          onClick={() => (listening ? stopSpeech() : startSpeech())}
          disabled={!canSpeech || disabled}
          className={`absolute right-2 top-2 inline-flex items-center gap-2 px-2 py-1 rounded-lg text-xs font-bold border ${(!canSpeech || disabled) ? "opacity-40 cursor-not-allowed" : "hover:bg-gray-50"} ${listening ? "border-red-300 text-red-700" : "border-gray-200 text-gray-700"}`}
          title={canSpeech ? (listening ? "Parar gravação" : "Transcrever por voz") : "Seu navegador não suporta transcrição"}
        >
          {listening ? <Square className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
          {listening ? "Gravando..." : "Microfone"}
        </button>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
          className={`w-full p-3 border rounded-lg resize-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent ${
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
            className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-gray-50 hover:bg-gray-100 border rounded-md disabled:opacity-50"
            title="Adicionar sugestão"
          >
            <Plus size={12} /> {b.length > 28 ? `${b.slice(0, 28)}...` : b}
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