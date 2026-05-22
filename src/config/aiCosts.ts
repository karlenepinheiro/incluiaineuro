/**
 * FONTE ÚNICA DE VERDADE PARA CUSTOS DE CRÉDITOS E REGRAS DE IA
 * 
 * Centraliza todos os valores de consumo de créditos para garantir 
 * que Custo Exibido = Custo Debitado em todo o sistema.
 */

export const AI_CREDIT_COSTS = {
  // Geração de Texto e Atividades
  TEXTO_SIMPLES: 1,         // Sugestões pedagógicas
  ATIVIDADE_TEXTO: 1,
  ADAPTAR_ATIVIDADE: 2,     // Adaptação curricular texto

  // Relatórios e Documentos
  RELATORIO_ECONOMICO: 1,   // Relatório econômico
  RELATORIO_PADRAO: 2,      // Relatório padrão
  RELATORIO_PREMIUM: 4,     // Relatório premium
  RELATORIO_INSS: 4,        // Relatório INSS / perícia

  // Protocolos Pedagógicos
  ESTUDO_DE_CASO: 5,
  PEI: 5,
  PAEE: 5,
  PDI: 5,

  // Fichas e Checklists
  CHECKLIST_OBSERVACAO: 2,  // Checklist observação (regente)
  ROTINA_CUIDADORA: 2,      // Rotina cuidadora
  FICHAS_PEDAGOGICAS: 2,    // Fichas pedagógicas

  // Planos de Ação
  PLANO_ACAO: 6,            // Plano Ação Professor Regente
  PLANO_ACAO_AEE: 7,        // Plano Ação AEE

  // Perfil Inteligente do Aluno
  PERFIL_INTELIGENTE: 6,

  // Processamento e OCR
  OCR: 1,                   // OCR simples
  ANALISE_DOCUMENTO: 3,     // Análise de documento
  UPLOAD_MODELO: 5,
  TEMPLATE: 5,

  // Imagens e Design (EduLens / NeuroDesign / AtivaIA / IncluiLAB)
  IMAGEM_LEVE: 8,           // Imagem visual (IncluiLAB Visual)
  IMAGEM_INTERMEDIARIA: 8,
  IMAGEM_PREMIUM: 15,       // Imagem premium (IncluiLAB Premium / Imagen 4.0)

  // Mapeamento específico por ferramenta (Compatibilidade Legada)
  EDULEISIA_ADAPTAR: 2,     // EduLensIA adaptação texto
  EDULEISIA_IMAGEM: 15,     // EduLensIA geração de imagem
  NEURODESIGN_REDESIGN: 2,  // NeuroDesign redesign texto
  NEURODESIGN_IMAGEM: 15,   // NeuroDesign geração de imagem
  ATIVIDADE_IMAGEM: 15,     // Atividade com imagem IA
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
 *  TEXT        → Texto simples (Gemini): 2 créditos
 *  NANO_BANANA → Imagem visual: 8 créditos
 *  GPT_IMAGE   → Imagem premium / Imagen 4.0 (alta qualidade): 15 créditos
 */
export const INCLUILAB_MODEL_COSTS = {
  TEXT:        2,   // Texto simples (IA Gemini) — IncluiLAB Texto
  NANO_BANANA: 8,   // Nano Banana Pro — IncluiLAB Visual
  GPT_IMAGE:   15,  // Imagen 4.0 / ChatGPT Imagem — IncluiLAB Premium
} as const;

/**
 * CUSTOS POR MODO DE GERAÇÃO — IncluiLAB v6 (6 modos)
 *
 * Criar nova atividade:
 *   A4_ECONOMICA        (2 cr)  — JSON + pictogramas/emoji internos, sem imagem IA
 *   A4_VISUAL           (8 cr)  — Guia (texto) + folha A4 como imagem visual
 *   A4_PREMIUM          (15 cr) — Guia (texto) + worksheet A4 premium HD
 *
 * Adaptar atividade enviada:
 *   ADAPTAR_ECONOMICO   (2 cr)  — Analisa + reconstrói A4 texto, sem imagem IA
 *   ADAPTAR_VISUAL      (8 cr)  — Analisa + guia (texto) + folha A4 imagem visual
 *   ADAPTAR_PREMIUM     (15 cr) — Analisa + guia (texto) + worksheet A4 premium HD
 *
 * Regra: imagem individual não é cobrada se a geração falhar (cai em emoji fallback).
 */
export const INCLUILAB_ACTIVITY_COSTS = {
  A4_ECONOMICA:             2,
  A4_VISUAL_BASE:           2,
  A4_VISUAL_PER_IMAGE:      2,
  A4_VISUAL_MAX:            8,
  A4_PREMIUM:              15,
  ADAPTAR_ECONOMICO:        2,
  ADAPTAR_VISUAL_BASE:      2,
  ADAPTAR_VISUAL_PER_IMAGE: 2,
  ADAPTAR_VISUAL_MAX:       8,
  ADAPTAR_PREMIUM:         15,
} as const;

/** Mensagem padrão exibida em TODAS as telas quando o saldo é insuficiente. */
export const CREDIT_INSUFFICIENT_MSG = 'Você não tem créditos suficiente para esta ação.';

export const CREDIT_PACKAGES = [
  { id: 'pkg_100', credits: 100, price: 29.90, label: 'Tarefas Rápidas / Relatórios Curtos' },
  { id: 'pkg_300', credits: 300, price: 79.90, label: 'Atividades e Materiais Frequentes' },
  { id: 'pkg_900', credits: 900, price: 149.90, label: 'Uso Intenso / Alta Produção' },
];
