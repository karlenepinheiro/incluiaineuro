import React, { useEffect, useRef, useState } from 'react';
import { Copy, Loader2, Mic, Square, Trash2 } from 'lucide-react';
import { StorageService } from '../services/storageService';

interface AudioRecorderProps {
  initialAudioUrl?: string;
  /**
   * onSave(url, durationSeconds, transcript?)
   * - transcript is best-effort (Web Speech API) and may be empty depending on browser permissions/support.
   */
  onSave: (url: string, duration: number, transcript?: string) => void;
  onDelete: () => void;
  readOnly?: boolean;
  /**
   * If true, attempts to transcribe speech while recording and returns it in onSave(..., transcript).
   */
  enableTranscription?: boolean;
  /**
   * Optional callback fired live while transcribing.
   */
  onTranscriptChange?: (text: string) => void;
}

type SpeechRecognitionType = typeof window extends any ? any : any;

export const AudioRecorder: React.FC<AudioRecorderProps> = ({
  initialAudioUrl,
  onSave,
  onDelete,
  readOnly,
  enableTranscription = true,
  onTranscriptChange,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(initialAudioUrl || null);
  const [isUploading, setIsUploading] = useState(false);
  const [transcript, setTranscript] = useState<string>('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);

  const recognitionRef = useRef<any>(null);
  const finalTranscriptRef = useRef<string>('');

  useEffect(() => {
    setAudioUrl(initialAudioUrl || null);
  }, [initialAudioUrl]);

  const canTranscribe = () => {
    const w = window as any;
    return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
  };

  const startSpeechRecognition = () => {
    if (!enableTranscription) return;
    if (!canTranscribe()) return;

    const w = window as any;
    const SR = (w.SpeechRecognition || w.webkitSpeechRecognition) as SpeechRecognitionType;
    const recognition = new SR();
    recognition.lang = 'pt-BR';
    recognition.continuous = true;
    recognition.interimResults = true;

    finalTranscriptRef.current = '';
    setTranscript('');

    recognition.onresult = (event: any) => {
      let interim = '';
      let final = finalTranscriptRef.current;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const text = (res[0]?.transcript || '').trim();
        if (!text) continue;

        if (res.isFinal) {
          final = (final + ' ' + text).trim();
        } else {
          interim = (interim + ' ' + text).trim();
        }
      }

      finalTranscriptRef.current = final;
      const merged = (final + (interim ? ' ' + interim : '')).trim();
      setTranscript(merged);
      onTranscriptChange?.(merged);
    };

    recognition.onerror = () => {
      // best-effort; ignore noisy errors (permission, no-speech, aborted)
    };

    recognition.onend = () => {
      // Do not auto-restart. Keep UX predictable and avoid edge cases.
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      // ignore
    }
  };

  const stopSpeechRecognition = () => {
    const recognition = recognitionRef.current;
    if (!recognition) return;

    try {
      recognition.stop();
    } catch {
      // ignore
    } finally {
      recognitionRef.current = null;
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const duration = (Date.now() - startTimeRef.current) / 1000;

        const transcriptFinal = (finalTranscriptRef.current || transcript || '').trim();
        await handleUpload(blob, duration, transcriptFinal);

        stream.getTracks().forEach((t) => t.stop());
      };

      startTimeRef.current = Date.now();
      setIsRecording(true);

      startSpeechRecognition();
      recorder.start();
    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('Erro ao acessar microfone. Verifique as permissões.');
    }
  };

  const stopRecording = () => {
    if (!mediaRecorderRef.current || !isRecording) return;

    setIsRecording(false);
    stopSpeechRecognition();

    try {
      mediaRecorderRef.current.stop();
    } catch (e) {
      console.warn('stop recorder failed', e);
    }
  };

  const handleUpload = async (blob: Blob, duration: number, transcriptFinal?: string) => {
    setIsUploading(true);
    try {
      const fileName = `audio_${Date.now()}.webm`;
      const file = new File([blob], fileName, { type: 'audio/webm' });

      // Mantendo o bucket atual para não mexer em infra.
      // Audios ficam em documentos_pdf/audio/...
      const url = await StorageService.uploadFile(file, 'documentos_pdf', `audio/${fileName}`);

      if (url) {
        setAudioUrl(url);
        onSave(url, duration, transcriptFinal);
      }
    } catch (error) {
      console.error('Upload failed', error);
      alert('Erro ao salvar áudio.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = () => {
    if (!confirm('Remover áudio?')) return;
    setAudioUrl(null);
    setTranscript('');
    finalTranscriptRef.current = '';
    onDelete();
  };

  const copyLink = async () => {
    if (!audioUrl) return;
    try {
      await navigator.clipboard.writeText(audioUrl);
      alert('Link do áudio copiado!');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = audioUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      alert('Link do áudio copiado!');
    }
  };

  if (readOnly) {
    if (!audioUrl) return null;
    return (
      <div className="flex items-center gap-2 p-2 bg-gray-50 rounded border">
        <audio controls src={audioUrl} className="h-8 w-64" />
        <button
          type="button"
          onClick={copyLink}
          className="p-1 text-gray-500 hover:text-gray-700"
          title="Copiar link do áudio"
        >
          <Copy size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 mt-2">
      {!audioUrl ? (
        !isRecording ? (
          <button
            type="button"
            onClick={startRecording}
            className="flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-600 rounded-full text-xs font-bold hover:bg-red-100 border border-red-200 transition-colors"
          >
            <Mic size={14} /> Gravar Áudio
          </button>
        ) : (
          <button
            type="button"
            onClick={stopRecording}
            className="flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white rounded-full text-xs font-bold hover:bg-red-700 animate-pulse"
          >
            <Square size={14} fill="currentColor" /> Parar (Gravando...)
          </button>
        )
      ) : (
        <div className="flex items-center gap-2 p-2 bg-gray-50 rounded border border-gray-200">
          <audio controls src={audioUrl} className="h-8 w-48" />
          <button
            type="button"
            onClick={copyLink}
            className="p-1 text-gray-500 hover:text-gray-700"
            title="Copiar link do áudio"
          >
            <Copy size={16} />
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="p-1 text-gray-400 hover:text-red-500"
            title="Remover áudio"
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}

      {isUploading && (
        <span className="text-xs text-gray-500 flex items-center gap-1">
          <Loader2 size={12} className="animate-spin" /> Salvando...
        </span>
      )}

      {isRecording && enableTranscription && canTranscribe() && (
        <span className="text-xs text-gray-500">Transcrevendo…</span>
      )}
    </div>
  );
};