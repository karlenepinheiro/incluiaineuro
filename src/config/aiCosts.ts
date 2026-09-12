import { CREDIT_CATALOG } from '../../supabase/functions/_shared/creditCatalog';
/**
 * FONTE ÚNICA DE VERDADE PARA CUSTOS DE CRÉDITOS E REGRAS DE IA
 * 
 * Centraliza todos os valores de consumo de créditos para garantir 
 * que Custo Exibido = Custo Debitado em todo o sistema.
 */

export const AI_CREDIT_COSTS = {
  // Geração de Texto e Atividades
  TEXTO_SIMPLES: CREDIT_CATALOG.SUGESTAO_PEDAGOGICA,         // Sugestões pedagógicas
  ATIVIDADE_TEXTO: CREDIT_CATALOG.INCLUILAB_ECONOMICO,
  ADAPTAR_ATIVIDADE: CREDIT_CATALOG.INCLUILAB_ADAPTAR_ECONOMICO,     // Adaptação curricular texto

  // Relatórios e Documentos
  RELATORIO_ECONOMICO: CREDIT_CATALOG.RELATORIO_ECONOMICO,   // Relatório econômico
  RELATORIO_PADRAO: CREDIT_CATALOG.RELATORIO_PADRAO,      // Relatório padrão
  RELATORIO_PREMIUM: CREDIT_CATALOG.RELATORIO_PREMIUM,     // Relatório premium
  RELATORIO_INSS: CREDIT_CATALOG.RELATORIO_INSS,        // Relatório INSS / perícia

  // Protocolos Pedagógicos
  ESTUDO_DE_CASO: CREDIT_CATALOG.ESTUDO_DE_CASO,
  PEI: CREDIT_CATALOG.PEI,
  PAEE: CREDIT_CATALOG.PAEE,
  PDI: CREDIT_CATALOG.PDI,
  DOCUMENTO_UNIFICADO_PEI_PAEE: CREDIT_CATALOG.DOCUMENTO_UNICO_PAEE_PEI,

  // Fichas e Checklists
  CHECKLIST_OBSERVACAO: CREDIT_CATALOG.FICHA_PEDAGOGICA_REGENTE,  // Checklist observação (regente)
  ROTINA_CUIDADORA: CREDIT_CATALOG.PARECER_CUIDADORA,      // Rotina cuidadora
  FICHAS_PEDAGOGICAS: CREDIT_CATALOG.FICHA_PEDAGOGICA_REGENTE,    // Fichas pedagógicas

  // Planos de Ação
  PLANO_ACAO: CREDIT_CATALOG.PLANO_REGENTE,            // Plano Ação Professor Regente
  PLANO_ACAO_AEE: CREDIT_CATALOG.PLANO_AEE,        // Plano Ação AEE

  // Perfil Inteligente do Aluno
  PERFIL_INTELIGENTE: CREDIT_CATALOG.PERFIL_INTELIGENTE,

  // Processamento e OCR
  OCR: CREDIT_CATALOG.OCR,                   // OCR simples
  ANALISE_DOCUMENTO: CREDIT_CATALOG.ANALISE_DOCUMENTO,     // Análise de documento
  UPLOAD_MODELO: CREDIT_CATALOG.UPLOAD_MODELO,
  TEMPLATE: CREDIT_CATALOG.UPLOAD_MODELO,

  // Importação de alunos por documento (StudentImportModal)
  IMPORTAR_DOCUMENTO_TEXTO: CREDIT_CATALOG.IMPORTAR_DOCUMENTO_TEXTO,    // DOCX / PDF com texto extraível
  IMPORTAR_DOCUMENTO_VISUAL: CREDIT_CATALOG.IMPORTAR_DOCUMENTO_VISUAL,   // Imagem / PDF escaneado (leitura visual IA)

  // Imagens e Design (EduLens / NeuroDesign / AtivaIA / IncluiLAB)
  IMAGEM_LEVE: CREDIT_CATALOG.INCLUILAB_VISUAL,           // Imagem visual (IncluiLAB Visual)
  IMAGEM_INTERMEDIARIA: CREDIT_CATALOG.INCLUILAB_VISUAL,
  IMAGEM_PREMIUM: CREDIT_CATALOG.INCLUILAB_PREMIUM,       // Imagem premium (IncluiLAB Premium / Imagen 4.0)

  // Mapeamento específico por ferramenta (Compatibilidade Legada)
  EDULEISIA_ADAPTAR: CREDIT_CATALOG.INCLUILAB_ADAPTAR_ECONOMICO,     // EduLensIA adaptação texto
  EDULEISIA_IMAGEM: CREDIT_CATALOG.INCLUILAB_PREMIUM,     // EduLensIA geração de imagem
  NEURODESIGN_REDESIGN: CREDIT_CATALOG.INCLUILAB_ADAPTAR_ECONOMICO,  // NeuroDesign redesign texto
  NEURODESIGN_IMAGEM: CREDIT_CATALOG.INCLUILAB_PREMIUM,   // NeuroDesign geração de imagem
  ATIVIDADE_IMAGEM: CREDIT_CATALOG.INCLUILAB_PREMIUM,     // Atividade com imagem IA
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
  TEXT: CREDIT_CATALOG.INCLUILAB_ECONOMICO,   // Texto simples (IA Gemini) — IncluiLAB Texto
  NANO_BANANA: CREDIT_CATALOG.INCLUILAB_VISUAL,   // Nano Banana Pro — IncluiLAB Visual
  GPT_IMAGE: CREDIT_CATALOG.INCLUILAB_PREMIUM,  // Imagen 4.0 / ChatGPT Imagem — IncluiLAB Premium
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
  A4_ECONOMICA:             CREDIT_CATALOG.INCLUILAB_ECONOMICO,
  A4_VISUAL_BASE:           2,
  A4_VISUAL_PER_IMAGE:      2,
  A4_VISUAL_MAX:            CREDIT_CATALOG.INCLUILAB_VISUAL,
  A4_PREMIUM:              CREDIT_CATALOG.INCLUILAB_PREMIUM,
  ADAPTAR_ECONOMICO:        CREDIT_CATALOG.INCLUILAB_ADAPTAR_ECONOMICO,
  ADAPTAR_VISUAL_BASE:      2,
  ADAPTAR_VISUAL_PER_IMAGE: 2,
  ADAPTAR_VISUAL_MAX:       CREDIT_CATALOG.INCLUILAB_ADAPTAR_VISUAL,
  ADAPTAR_PREMIUM:         CREDIT_CATALOG.INCLUILAB_ADAPTAR_PREMIUM,
} as const;

/** Mensagem padrão exibida em TODAS as telas quando o saldo é insuficiente. */
export const CREDIT_INSUFFICIENT_MSG = 'Você não tem créditos suficiente para esta ação.';

export const CREDIT_PACKAGES = [
  { id: 'pkg_100', credits: 100, price: 29.90, label: 'Tarefas Rápidas / Relatórios Curtos' },
  { id: 'pkg_300', credits: 300, price: 79.90, label: 'Atividades e Materiais Frequentes' },
  { id: 'pkg_900', credits: 900, price: 149.90, label: 'Uso Intenso / Alta Produção' },
];
