// src/config/incluilabUi.ts
//
// Feature flag central do IncluiLAB — alterna entre a interface clássica
// ("Studio", com seletores sempre visíveis) e a nova interface experimental
// estilo chat de IA (conversa livre, opções avançadas colapsadas).
//
// ─────────────────────────────────────────────────────────────────────────
// COMO REVERTER PARA A INTERFACE ANTIGA:
//   1. Troque o valor abaixo para `false`.
//   2. Salve o arquivo. Nenhuma outra alteração é necessária.
//   3. A interface clássica volta a ser exibida imediatamente, sem perda
//      de dados, histórico ou funcionalidades — o código antigo permanece
//      intacto em `src/views/IncluiLabView.tsx`.
// ─────────────────────────────────────────────────────────────────────────
export const INCLUILAB_NEW_UI = true;

// Checkpoint 2B.1: a flag do pipeline canônico (motor) foi movida para
// src/config/incluilabPipeline.ts — separação arquitetural entre UI e motor.
// Esta flag (INCLUILAB_NEW_UI) trata só da interface e não muda de lugar.
