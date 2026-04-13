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

/** Mensagem padrão exibida em TODAS as telas quando o saldo é insuficiente. */
export const CREDIT_INSUFFICIENT_MSG = 'Você não tem créditos suficiente para esta ação.';

export const CREDIT_PACKAGES = [
  { id: 'pkg_100', credits: 100, price: 29.90, label: 'Tarefas Rápidas / Relatórios Curtos' },
  { id: 'pkg_300', credits: 300, price: 79.90, label: 'Atividades e Materiais Frequentes' },
  { id: 'pkg_900', credits: 900, price: 149.90, label: 'Uso Intenso / Alta Produção' },
];
