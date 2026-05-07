import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LifeBuoy, ChevronDown, ChevronUp, MessageCircle,
  PlayCircle, FileText, Brain, Target, BookOpen,
} from 'lucide-react';

const WA_NUMBER = '5511999999999'; // TODO: substituir pelo número real do suporte
const WA_MESSAGE = encodeURIComponent('Olá! Vim pelo IncluiAI e gostaria de ajuda.');
const WA_URL = `https://wa.me/${WA_NUMBER}?text=${WA_MESSAGE}`;

const C = {
  bg:      '#F6F4EF',
  surface: '#FFFFFF',
  text:    '#1F2937',
  textSec: '#667085',
  petrol:  '#1F4E5F',
  dark:    '#2E3A59',
  gold:    '#C69214',
  border:  '#E7E2D8',
  wa:      '#25D366',
};

const WA_SVG = (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="white" aria-hidden="true">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

const FAQ_ITEMS = [
  {
    q: 'Como gerar um PEI (Plano Educacional Individualizado)?',
    a: 'Acesse "PEI" no menu lateral, selecione o aluno e clique em "Gerar com IA". O sistema cria o documento completo com base no perfil do aluno.',
  },
  {
    q: 'Como criar um Estudo de Caso?',
    a: 'Clique em "Estudo de Caso" no menu lateral. Selecione o aluno, preencha o contexto e clique em "Gerar com IA". O documento é criado em segundos.',
  },
  {
    q: 'O que é o Perfil Cognitivo (Perfil Inteligente)?',
    a: 'É um radar visual de 10 dimensões do desenvolvimento do aluno. Disponível no plano PRO em "Perfil Cognitivo". Você preenche as avaliações e o sistema gera gráficos e análises.',
  },
  {
    q: 'Como funciona o Plano de Ação?',
    a: 'O Plano de Ação (AtivaIA) é um workflow visual inteligente. Use os templates prontos para TEA, TDAH e outras necessidades específicas.',
  },
  {
    q: 'Meus créditos acabaram. O que faço?',
    a: 'Acesse "Assinatura & Créditos" para comprar créditos avulsos (+100, +300 ou +900) ou fazer upgrade do plano.',
  },
  {
    q: 'Como adicionar assinatura digital no documento?',
    a: 'Ao finalizar um documento, o campo de assinatura permite assinar digitalmente ou manualmente. Nas fichas, a assinatura da família também pode ser incluída.',
  },
  {
    q: 'Posso exportar os documentos gerados?',
    a: 'Sim. Todos os documentos exportam em PDF com QR Code de validação. No IncluiLAB, também é possível exportar como .docx (Word).',
  },
];

const QUICK_LINKS = [
  { icon: FileText, label: 'Como gerar PEI',                nav: 'protocols',   color: '#16A34A' },
  { icon: BookOpen, label: 'Como gerar Estudo de Caso',     nav: 'estudo_caso', color: '#7C3AED' },
  { icon: Brain,    label: 'Como usar o Perfil Inteligente', nav: 'reports',    color: '#8B5CF6' },
  { icon: Target,   label: 'Como usar o Plano de Ação',     nav: 'protocols',   color: '#EA580C' },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: `1.5px solid ${open ? C.petrol + '40' : C.border}`, transition: 'border-color 0.2s' }}
    >
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
        style={{ background: open ? C.petrol + '07' : C.surface }}
      >
        <span className="text-sm font-semibold pr-4" style={{ color: C.dark }}>{q}</span>
        {open
          ? <ChevronUp   size={16} style={{ color: C.petrol,  flexShrink: 0 }} />
          : <ChevronDown size={16} style={{ color: C.textSec, flexShrink: 0 }} />
        }
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            <div className="px-5 py-4" style={{ borderTop: `1px solid ${C.border}`, background: C.surface }}>
              <p className="text-sm leading-relaxed" style={{ color: C.textSec }}>{a}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface HelpCenterViewProps {
  onNavigate?: (view: string) => void;
}

export function HelpCenterView({ onNavigate }: HelpCenterViewProps) {
  return (
    <div className="min-h-screen p-5 md:p-8 space-y-8" style={{ background: C.bg }}>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: C.petrol + '15' }}>
            <LifeBuoy size={22} style={{ color: C.petrol }} />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold" style={{ color: C.dark }}>Central de Ajuda</h1>
            <p className="text-sm" style={{ color: C.textSec }}>Tire suas dúvidas e acesse suporte rápido</p>
          </div>
        </div>
      </motion.div>

      {/* WhatsApp CTA banner */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.06 }}
        className="rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5"
        style={{
          background: 'linear-gradient(135deg, #25D36618 0%, #25D36608 100%)',
          border: '1.5px solid #25D36630',
          boxShadow: '0 2px 16px rgba(37,211,102,0.09)',
        }}
      >
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: C.wa, boxShadow: '0 4px 16px rgba(37,211,102,0.30)' }}>
          {WA_SVG}
        </div>
        <div className="flex-1">
          <h3 className="text-base font-bold mb-1" style={{ color: C.dark }}>Suporte Humanizado via WhatsApp</h3>
          <p className="text-sm" style={{ color: C.textSec }}>
            Fale diretamente com nossa equipe. Respondemos em minutos nos dias úteis.
          </p>
        </div>
        <a
          href={WA_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm text-white shrink-0 transition hover:opacity-90"
          style={{ background: C.wa, boxShadow: '0 2px 12px rgba(37,211,102,0.30)', textDecoration: 'none' }}
        >
          <MessageCircle size={16} />
          Falar agora
        </a>
      </motion.div>

      {/* Body: FAQ + sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* FAQ */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="lg:col-span-2"
        >
          <h2 className="text-sm font-bold mb-4" style={{ color: C.dark }}>Perguntas Frequentes</h2>
          <div className="space-y-2">
            {FAQ_ITEMS.map((item, i) => (
              <FaqItem key={i} q={item.q} a={item.a} />
            ))}
          </div>
        </motion.div>

        {/* Sidebar */}
        <div className="space-y-5">

          {/* Quick Links */}
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="rounded-2xl p-5"
            style={{ background: C.surface, border: `1px solid ${C.border}` }}
          >
            <h3 className="text-sm font-bold mb-4" style={{ color: C.dark }}>Atalhos Rápidos</h3>
            <div className="space-y-2">
              {QUICK_LINKS.map(({ icon: Icon, label, nav, color }) => (
                <button
                  key={`${nav}-${label}`}
                  onClick={() => onNavigate?.(nav)}
                  className="w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:opacity-80"
                  style={{ background: color + '12', border: `1px solid ${color}20` }}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: color + '22' }}>
                    <Icon size={15} style={{ color }} />
                  </div>
                  <span className="text-xs font-semibold" style={{ color: C.dark }}>{label}</span>
                </button>
              ))}
            </div>
          </motion.div>

          {/* Video placeholder */}
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="rounded-2xl p-5"
            style={{ background: C.surface, border: `1px solid ${C.border}` }}
          >
            <h3 className="text-sm font-bold mb-1" style={{ color: C.dark }}>Tutoriais em Vídeo</h3>
            <p className="text-[11px] mb-4" style={{ color: C.textSec }}>Em breve — aguarde novidades</p>
            <div className="rounded-xl flex items-center justify-center h-28"
              style={{ background: C.bg, border: `2px dashed ${C.border}` }}>
              <div className="text-center">
                <PlayCircle size={28} style={{ color: C.textSec, opacity: 0.35, margin: '0 auto 6px' }} />
                <p className="text-[11px] font-medium" style={{ color: C.textSec }}>Vídeos em breve</p>
              </div>
            </div>
          </motion.div>

        </div>
      </div>
    </div>
  );
}
