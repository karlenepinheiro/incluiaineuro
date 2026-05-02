/**
 * FONTE ÚNICA DE VERDADE PARA CUSTOS DE CRÉDITOS E REGRAS DE IA
 * 
 * Centraliza todos os valores de consumo de créditos para garantir 
 * que Custo Exibido = Custo Debitado em todo o sistema.
 */

export const AI_CREDIT_COSTS = {
  // Geração de Texto e Atividades
  TEXTO_SIMPLES: 1,
  ATIVIDADE_TEXTO: 1,
  ADAPTAR_ATIVIDADE: 3,
  
  // Relatórios e Documentos
  RELATORIO_PADRAO: 3,
  RELATORIO_ECONOMICO: 1,
  RELATORIO_PREMIUM: 5,
  ESTUDO_DE_CASO: 3,
  PEI: 3,
  PAEE: 3,
  PDI: 3,
  
  // Perfil Inteligente do Aluno
  PERFIL_INTELIGENTE: 5,

  // Processamento e OCR
  ANALISE_DOCUMENTO: 5,
  UPLOAD_MODELO: 5,
  OCR: 1,
  TEMPLATE: 5,

  // Imagens e Design (EduLens / NeuroDesign / AtivaIA)
  IMAGEM_LEVE: 30,       // Imagem padrão
  IMAGEM_INTERMEDIARIA: 30,
  IMAGEM_PREMIUM: 50,    // Motor de Imagem Premium (Imagen 4.0 / IncluiLab)
  
  // Mapeamento específico por ferramenta (Compatibilidade Legada)
  EDULEISIA_ADAPTAR: 3,
  EDULEISIA_IMAGEM: 50,
  NEURODESIGN_REDESIGN: 3,
  NEURODESIGN_IMAGEM: 50,
  ATIVIDADE_IMAGEM: 50,
};

export const SUBSCRIPTION_PLANS = {
  FREE: {
    name: 'Starter (Grátis)',
    credits: 60,   // regra oficial: 60 créditos/mês
    students: 5,
  },
  PRO: {
    name: 'Profissional',
    credits: 500,  // regra oficial: 500 créditos/mês
    students: 30,
  },
  MASTER: { // PREMIUM é referenciado como MASTER no sistema
    name: 'Premium',
    credits: 700,  // regra oficial: 700 créditos/mês
    students: 9999,
  }
};

/**
 * CUSTOS OFICIAIS DOS MODELOS DE ATIVIDADE — IncluiLab (Scanner + NeuroDesign)
 * Fonte única de verdade. Todos os componentes devem referenciar estes valores.
 *
 *  TEXT        → Texto simples (Gemini): 3 créditos
 *  NANO_BANANA → Imagem padrão: 30 créditos
 *  GPT_IMAGE   → Imagem detalhada / Imagen 4.0 (alta qualidade): 50 créditos
 */
export const INCLUILAB_MODEL_COSTS = {
  TEXT:        3,   // Texto simples (IA Gemini)
  NANO_BANANA: 30,  // Nano Banana Pro — versão branda (30 créditos/imagem)
  GPT_IMAGE:   50,  // ChatGPT Imagem / DALL-E 3 — alta qualidade
} as const;

/**
 * CUSTOS POR MODO DE GERAÇÃO — IncluiLAB v6 (6 modos)
 *
 * Criar nova atividade:
 *   A4_ECONOMICA        (3 cr)  — JSON + pictogramas/emoji internos, sem imagem IA
 *   A4_VISUAL           (15 cr) — JSON + até 4 imagens IA pequenas (3 base + 3/img)
 *   A4_PREMIUM          (50 cr) — Imagem completa estilo Canva/worksheet
 *
 * Adaptar atividade enviada:
 *   ADAPTAR_ECONOMICO   (5 cr)  — Analisa + reconstrói A4 texto, sem imagem IA
 *   ADAPTAR_VISUAL      (20 cr) — Analisa + reconstrói com até 4 imagens IA (5 base + 4/img × até 4)
 *   ADAPTAR_PREMIUM     (50 cr) — Recria visualmente como worksheet premium
 *
 * Regra: imagem individual não é cobrada se a geração falhar (cai em emoji fallback).
 */
export const INCLUILAB_ACTIVITY_COSTS = {
  A4_ECONOMICA:           3,
  A4_VISUAL_BASE:         3,
  A4_VISUAL_PER_IMAGE:    3,
  A4_VISUAL_MAX:         15,
  A4_PREMIUM:            50,
  ADAPTAR_ECONOMICO:      5,
  ADAPTAR_VISUAL_BASE:    5,
  ADAPTAR_VISUAL_PER_IMAGE: 4,
  ADAPTAR_VISUAL_MAX:    20,
  ADAPTAR_PREMIUM:       50,
} as const;

/** Mensagem padrão exibida em TODAS as telas quando o saldo é insuficiente. */
export const CREDIT_INSUFFICIENT_MSG = 'Você não tem créditos suficiente para esta ação.';

export const CREDIT_PACKAGES = [
  { id: 'pkg_100', credits: 100, price: 29.90, label: 'Tarefas Rápidas / Relatórios Curtos' },
  { id: 'pkg_300', credits: 300, price: 79.90, label: 'Atividades e Materiais Frequentes' },
  { id: 'pkg_900', credits: 900, price: 149.90, label: 'Uso Intenso / Alta Produção' },
];
