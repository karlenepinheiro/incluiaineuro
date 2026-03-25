// components/AudioEnhancedTextarea.tsx
// Textarea reutilizável com: áudio → transcrição + chips de sugestão contextual
// Versão unificada que substitui SmartTextarea + AudioTranscriptionField em campos longos
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Mic, Square, AlertCircle, Plus, ChevronDown, ChevronUp } from 'lucide-react';

// ─── Biblioteca de sugestões contextuais ───────────────────────────────────────
const SUGGESTIONS: Record<string, string[]> = {
  // ── Fichas de observação ──
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
  // ── Documentos para responsáveis ──
  motivo: [
    'Apresenta dificuldades persistentes de aprendizagem que requerem avaliação especializada.',
    'Observou-se necessidade de avaliação multiprofissional para melhor compreensão do caso.',
    'Demonstra comportamentos que impactam seu desempenho escolar e social.',
    'Necessita de suporte especializado além do oferecido pela escola regular.',
  ],
  motivo_complemento: [
    'As intervenções realizadas em sala não foram suficientes para superar as dificuldades.',
    'O aluno apresenta características que sugerem necessidade de diagnóstico formal.',
    'Após período de acompanhamento pedagógico, identificou-se a necessidade de apoio externo.',
    'A família também observou as mesmas dificuldades no contexto domiciliar.',
  ],
  observacoes: [
    'A equipe observou que o aluno apresenta potencial a ser desenvolvido com apoio adequado.',
    'Durante o acompanhamento, foram identificadas estratégias eficazes que devem ser mantidas.',
    'Ressalta-se a importância da parceria família-escola para o sucesso do processo.',
    'Demais informações relevantes foram registradas no dossiê do aluno.',
  ],
  pauta: [
    'Reunião destinada à discussão do desenvolvimento e encaminhamentos do aluno.',
    'Apresentação do Plano Educacional Individualizado e estratégias pedagógicas.',
    'Alinhamento entre escola e família sobre rotinas e apoios necessários.',
    'Comunicação dos resultados das avaliações e próximos passos.',
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
  // ── Genérico ──
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

// ─── Função para encontrar sugestões pelo contexto ─────────────────────────────
function getChips(fieldId: string, customChips?: string[]): string[] {
  if (customChips && customChips.length > 0) return customChips;
  // Busca direta
  if (SUGGESTIONS[fieldId]) return SUGGESTIONS[fieldId];
  // Busca por sufixo
  const keys = Object.keys(SUGGESTIONS);
  const match = keys.find(k => fieldId.includes(k) || k.includes(fieldId));
  if (match) return SUGGESTIONS[match];
  // Fallback genérico
  return SUGGESTIONS.observacoes_equipe;
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface AudioEnhancedTextareaProps {
  /** ID do campo — usado para buscar chips contextuais */
  fieldId?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  required?: boolean;
  disabled?: boolean;
  /** Chips personalizados (substitui os automáticos) */
  suggestionChips?: string[];
  /** Ocultar chips (quando o espaço é muito pequeno) */
  hideChips?: boolean;
  /** Habilitar/desabilitar áudio explicitamente */
  enableAudio?: boolean;
}

export const AudioEnhancedTextarea: React.FC<AudioEnhancedTextareaProps> = ({
  fieldId = 'general',
  label,
  value,
  onChange,
  placeholder,
  rows = 4,
  required = false,
  disabled = false,
  suggestionChips,
  hideChips = false,
  enableAudio = true,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [audioError, setAudioError] = useState('');
  const [showAllChips, setShowAllChips] = useState(false);

  const recognitionRef = useRef<any>(null);
  const baseValueRef = useRef(value);

  const hasRecognition = !!(
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  );

  const chips = useMemo(() => getChips(fieldId, suggestionChips), [fieldId, suggestionChips]);
  const visibleChips = showAllChips ? chips : chips.slice(0, 2);

  const addChip = (text: string) => {
    if (disabled) return;
    const current = (value || '').trim();
    const next = current ? `${current}\n${text}` : text;
    onChange(next);
  };

  const startRecording = () => {
    if (disabled) return;
    setAudioError('');
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setAudioError('Reconhecimento de voz não suportado. Use Google Chrome.');
      return;
    }

    baseValueRef.current = value;

    const rec = new SpeechRecognition();
    rec.lang = 'pt-BR';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    let finalAccum = '';

    rec.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalAccum += t + ' ';
          interim = '';
        } else {
          interim += t;
        }
      }
      setInterimText(interim);
      if (finalAccum.trim()) {
        const sep = baseValueRef.current.trim() ? ' ' : '';
        onChange((baseValueRef.current + sep + finalAccum).trim());
      }
    };

    rec.onerror = (e: any) => {
      if (e.error !== 'no-speech') {
        setAudioError(`Erro: ${e.error === 'not-allowed' ? 'permissão negada' : e.error}`);
      }
      stopRecording();
    };

    rec.onend = () => {
      setIsRecording(false);
      setInterimText('');
    };

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

  const displayValue =
    isRecording && interimText
      ? value.trim()
        ? value + ' ' + interimText
        : interimText
      : value;

  return (
    <div className="space-y-1.5">
      {/* Label + botão de áudio */}
      {(label || enableAudio) && (
        <div className="flex items-center justify-between">
          {label && (
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">
              {label}
              {required && <span className="text-red-500 ml-1">*</span>}
            </label>
          )}
          {enableAudio && !disabled && (
            <div className="flex items-center gap-1.5">
              {hasRecognition ? (
                <button
                  type="button"
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition select-none ${
                    isRecording
                      ? 'bg-red-100 text-red-700 animate-pulse'
                      : 'bg-gray-100 text-gray-600 hover:bg-[#1F4E5F]/10 hover:text-[#1F4E5F]'
                  }`}
                >
                  {isRecording ? (
                    <><Square size={10} /> Parar</>
                  ) : (
                    <><Mic size={10} /> Gravar áudio</>
                  )}
                </button>
              ) : (
                <span className="text-[10px] text-gray-400 flex items-center gap-1">
                  <AlertCircle size={10} /> Chrome only
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Textarea */}
      <textarea
        rows={rows}
        disabled={disabled}
        className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none resize-none transition ${
          disabled
            ? 'bg-gray-50 text-gray-400 cursor-not-allowed border-gray-100'
            : isRecording
            ? 'border-red-300 ring-2 ring-red-100 bg-red-50/30'
            : 'border-gray-200 focus:ring-2 focus:ring-[#1F4E5F]/25 focus:border-[#1F4E5F]/50 bg-white'
        }`}
        placeholder={
          placeholder ||
          (hasRecognition && enableAudio
            ? 'Digite ou clique em "Gravar áudio" para transcrever...'
            : 'Digite o texto...')
        }
        value={displayValue}
        onChange={e => {
          if (!isRecording && !disabled) onChange(e.target.value);
        }}
        readOnly={isRecording}
      />

      {/* Status de gravação */}
      {isRecording && (
        <p className="text-xs text-red-600 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
          Gravando... fale claramente. Clique em "Parar" ao terminar.
        </p>
      )}

      {/* Erro de áudio */}
      {audioError && (
        <p className="text-xs text-red-500 flex items-center gap-1">
          <AlertCircle size={11} /> {audioError}
        </p>
      )}

      {/* Chips de sugestão */}
      {!hideChips && !disabled && chips.length > 0 && (
        <div className="space-y-1">
          <div className="flex flex-wrap gap-1.5">
            {visibleChips.map((chip, i) => (
              <button
                key={i}
                type="button"
                onClick={() => addChip(chip)}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] bg-[#F6F4EF] hover:bg-[#1F4E5F]/10 border border-[#E7E2D8] rounded-lg text-gray-600 hover:text-[#1F4E5F] transition"
                title={chip}
              >
                <Plus size={10} />
                {chip.length > 40 ? chip.slice(0, 40) + '…' : chip}
              </button>
            ))}
          </div>
          {chips.length > 2 && (
            <button
              type="button"
              onClick={() => setShowAllChips(v => !v)}
              className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-[#1F4E5F] transition"
            >
              {showAllChips ? (
                <><ChevronUp size={10} /> Menos sugestões</>
              ) : (
                <><ChevronDown size={10} /> +{chips.length - 2} sugestões</>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default AudioEnhancedTextarea;
