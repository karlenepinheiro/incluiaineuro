// components/AudioTranscriptionField.tsx
// Campo de texto com suporte a gravação de áudio e transcrição automática (Web Speech API)
import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, AlertCircle } from 'lucide-react';

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  required?: boolean;
}

export const AudioTranscriptionField: React.FC<Props> = ({
  label,
  value,
  onChange,
  placeholder,
  rows = 4,
  required = false,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [error, setError] = useState('');
  const recognitionRef = useRef<any>(null);
  const baseValueRef = useRef(value); // snapshot de value ao iniciar gravação

  const hasRecognition = !!(
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  );

  const startRecording = () => {
    setError('');
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Reconhecimento de voz não suportado. Use Google Chrome.');
      return;
    }

    baseValueRef.current = value; // guarda valor atual como base

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
        const separator = baseValueRef.current.trim() ? ' ' : '';
        onChange((baseValueRef.current + separator + finalAccum).trim());
      }
    };

    rec.onerror = (e: any) => {
      if (e.error !== 'no-speech') {
        setError(`Erro de reconhecimento: ${e.error}`);
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

  // Texto visível no textarea: valor persistido + interim em tempo real
  const displayValue = isRecording && interimText
    ? (value.trim() ? value + ' ' + interimText : interimText)
    : value;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>

        {hasRecognition ? (
          <button
            type="button"
            onClick={isRecording ? stopRecording : startRecording}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition select-none ${
              isRecording
                ? 'bg-red-100 text-red-700 animate-pulse'
                : 'bg-gray-100 text-gray-600 hover:bg-[#1F4E5F]/10 hover:text-[#1F4E5F]'
            }`}
          >
            {isRecording
              ? <><Square size={11} /> Parar</>
              : <><Mic size={11} /> Gravar áudio</>}
          </button>
        ) : (
          <span className="text-[10px] text-gray-400 flex items-center gap-1">
            <AlertCircle size={10} /> Voz: Chrome only
          </span>
        )}
      </div>

      <textarea
        rows={rows}
        className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none resize-none transition ${
          isRecording
            ? 'border-red-300 ring-2 ring-red-100 bg-red-50/30'
            : 'border-gray-200 focus:ring-2 focus:ring-[#1F4E5F]/25 focus:border-[#1F4E5F]/50'
        }`}
        placeholder={
          placeholder ||
          (hasRecognition
            ? 'Digite ou clique em "Gravar áudio" para transcrever...'
            : 'Digite o texto...')
        }
        value={displayValue}
        onChange={e => {
          if (!isRecording) onChange(e.target.value);
        }}
        readOnly={isRecording}
      />

      {isRecording && (
        <p className="text-xs text-red-600 flex items-center gap-1.5 mt-1">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block" />
          Gravando... fale claramente em português. Clique em "Parar" ao terminar.
        </p>
      )}
      {error && (
        <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
          <AlertCircle size={11} /> {error}
        </p>
      )}
    </div>
  );
};
