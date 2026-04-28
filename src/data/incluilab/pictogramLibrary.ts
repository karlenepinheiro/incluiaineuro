export interface Pictogram {
  id: string;
  category: 'animais' | 'matematica' | 'leitura' | 'rotina_escolar' | 'ciencias' | 'emocional';
  label: string;
  keywords: string[];
  fallbackEmoji: string;
  prompt: string;
}

export const pictogramLibrary: Pictogram[] = [
  // ── ANIMAIS ──────────────────────────────────────────────────────────────────
  { id: 'cachorro', category: 'animais', label: 'Cachorro', keywords: ['cachorro', 'cao', 'dog', 'pet', 'vira-lata', 'labrador', 'poodle', 'caozinho', 'caes'], fallbackEmoji: '🐶', prompt: 'friendly cartoon dog for children worksheet' },
  { id: 'gato', category: 'animais', label: 'Gato', keywords: ['gato', 'gata', 'cat', 'felino', 'bichano', 'miau', 'gatinho'], fallbackEmoji: '🐱', prompt: 'cute cartoon cat for children worksheet' },
  { id: 'passaro', category: 'animais', label: 'Pássaro', keywords: ['passaro', 'passarinho', 'ave', 'bird', 'papagaio', 'canario', 'pomba', 'voo', 'asas', 'andorinha'], fallbackEmoji: '🐦', prompt: 'colorful cartoon bird for children worksheet' },
  { id: 'peixe', category: 'animais', label: 'Peixe', keywords: ['peixe', 'peixinho', 'fish', 'aquatico', 'aquario', 'tubarao', 'golfinho'], fallbackEmoji: '🐟', prompt: 'cute cartoon fish for children worksheet' },
  { id: 'coelho', category: 'animais', label: 'Coelho', keywords: ['coelho', 'coelhinho', 'rabbit', 'lebre', 'pascoa', 'orelha'], fallbackEmoji: '🐰', prompt: 'cute cartoon rabbit for children worksheet' },
  { id: 'borboleta', category: 'animais', label: 'Borboleta', keywords: ['borboleta', 'butterfly', 'lagarta', 'crisalida', 'metamorfose', 'inseto'], fallbackEmoji: '🦋', prompt: 'colorful butterfly cartoon for children worksheet' },
  { id: 'leao', category: 'animais', label: 'Leão', keywords: ['leao', 'leoa', 'lion', 'rei', 'selva', 'africa', 'juba'], fallbackEmoji: '🦁', prompt: 'friendly lion cartoon for children worksheet' },
  { id: 'elefante', category: 'animais', label: 'Elefante', keywords: ['elefante', 'elephant', 'tromba', 'africa', 'india', 'paquiderme'], fallbackEmoji: '🐘', prompt: 'cute elephant cartoon for children worksheet' },
  { id: 'macaco', category: 'animais', label: 'Macaco', keywords: ['macaco', 'monkey', 'gorila', 'primata', 'banana', 'selva', 'chimpanze'], fallbackEmoji: '🐒', prompt: 'playful monkey cartoon for children worksheet' },
  { id: 'tartaruga', category: 'animais', label: 'Tartaruga', keywords: ['tartaruga', 'turtle', 'casco', 'devagar', 'reptil', 'jabuti'], fallbackEmoji: '🐢', prompt: 'friendly turtle cartoon for children worksheet' },
  { id: 'vaca', category: 'animais', label: 'Vaca', keywords: ['vaca', 'boi', 'touro', 'cow', 'fazenda', 'leite', 'bezerro', 'gado'], fallbackEmoji: '🐄', prompt: 'cute cow cartoon for children worksheet' },
  { id: 'porco', category: 'animais', label: 'Porco', keywords: ['porco', 'porca', 'pig', 'leitao', 'fazenda', 'chiqueiro'], fallbackEmoji: '🐷', prompt: 'cute pig cartoon for children worksheet' },
  { id: 'galinha', category: 'animais', label: 'Galinha', keywords: ['galinha', 'galo', 'pintinho', 'chicken', 'ovo', 'fazenda', 'aves', 'peru'], fallbackEmoji: '🐔', prompt: 'cute chicken cartoon for children worksheet' },
  { id: 'abelha', category: 'animais', label: 'Abelha', keywords: ['abelha', 'bee', 'mel', 'colmeia', 'flor', 'polinizacao', 'vespa'], fallbackEmoji: '🐝', prompt: 'cute bee cartoon for children worksheet' },
  { id: 'sapo', category: 'animais', label: 'Sapo', keywords: ['sapo', 'ra', 'frog', 'anfibio', 'lagoa', 'pulo'], fallbackEmoji: '🐸', prompt: 'cute frog cartoon for children worksheet' },
  { id: 'cobra', category: 'animais', label: 'Cobra', keywords: ['cobra', 'serpente', 'snake', 'reptil', 'cascavel', 'jiboia'], fallbackEmoji: '🐍', prompt: 'friendly snake cartoon for children worksheet' },
  { id: 'cavalo', category: 'animais', label: 'Cavalo', keywords: ['cavalo', 'egua', 'horse', 'pony', 'crina', 'ferradura', 'potro'], fallbackEmoji: '🐴', prompt: 'cute horse cartoon for children worksheet' },
  { id: 'ovelha', category: 'animais', label: 'Ovelha', keywords: ['ovelha', 'carneiro', 'sheep', 'la', 'fazenda', 'cordeiro'], fallbackEmoji: '🐑', prompt: 'cute sheep cartoon for children worksheet' },

  // ── MATEMÁTICA ───────────────────────────────────────────────────────────────
  { id: 'numero', category: 'matematica', label: 'Número', keywords: ['numero', 'numeros', 'contar', 'contagem', 'quantidade', 'numeral', 'algarismo'], fallbackEmoji: '🔢', prompt: 'number counting illustration for children worksheet' },
  { id: 'soma', category: 'matematica', label: 'Adição', keywords: ['soma', 'adicao', 'adicionar', 'mais', 'somar', 'calcular', 'calculo', 'adicao', 'resultado'], fallbackEmoji: '➕', prompt: 'addition math illustration for children worksheet' },
  { id: 'subtracao', category: 'matematica', label: 'Subtração', keywords: ['subtracao', 'subtrair', 'menos', 'tirar', 'diminuir', 'diferenca', 'resto'], fallbackEmoji: '➖', prompt: 'subtraction math illustration for children worksheet' },
  { id: 'multiplicacao', category: 'matematica', label: 'Multiplicação', keywords: ['multiplicacao', 'multiplicar', 'vezes', 'tabuada', 'produto', 'fator'], fallbackEmoji: '✖️', prompt: 'multiplication math illustration for children worksheet' },
  { id: 'divisao', category: 'matematica', label: 'Divisão', keywords: ['divisao', 'dividir', 'fracao', 'metade', 'quociente', 'dividendo'], fallbackEmoji: '➗', prompt: 'division math illustration for children worksheet' },
  { id: 'forma', category: 'matematica', label: 'Formas', keywords: ['forma', 'formas', 'geometria', 'circulo', 'quadrado', 'triangulo', 'retangulo', 'hexagono', 'pentagono', 'losango'], fallbackEmoji: '🔷', prompt: 'geometric shapes illustration for children worksheet' },
  { id: 'medicao', category: 'matematica', label: 'Medição', keywords: ['medicao', 'medir', 'regua', 'comprimento', 'altura', 'peso', 'metro', 'centimetro', 'tamanho'], fallbackEmoji: '📏', prompt: 'measurement ruler illustration for children worksheet' },
  { id: 'relogio', category: 'matematica', label: 'Hora', keywords: ['hora', 'horas', 'relogio', 'clock', 'minutos', 'tempo', 'ponteiro', 'meia'], fallbackEmoji: '🕐', prompt: 'clock time illustration for children worksheet' },
  { id: 'dinheiro', category: 'matematica', label: 'Dinheiro', keywords: ['dinheiro', 'moeda', 'real', 'preco', 'valor', 'compra', 'troco', 'centavo', 'nota'], fallbackEmoji: '💰', prompt: 'money coins illustration for children worksheet' },
  { id: 'grafico', category: 'matematica', label: 'Gráfico', keywords: ['grafico', 'tabela', 'dados', 'estatistica', 'barra', 'pizza', 'coluna', 'legenda'], fallbackEmoji: '📊', prompt: 'chart graph illustration for children worksheet' },
  { id: 'sequencia', category: 'matematica', label: 'Sequência', keywords: ['sequencia', 'padrao', 'ordem', 'serie', 'proximo', 'continuar', 'padrão'], fallbackEmoji: '🔢', prompt: 'sequence pattern illustration for children worksheet' },
  { id: 'fracao', category: 'matematica', label: 'Fração', keywords: ['fracao', 'fração', 'metade', 'terco', 'quarto', 'parte', 'inteiro', 'numerador', 'denominador'], fallbackEmoji: '🍕', prompt: 'fraction pie illustration for children worksheet' },

  // ── LEITURA ──────────────────────────────────────────────────────────────────
  { id: 'livro', category: 'leitura', label: 'Livro', keywords: ['livro', 'livros', 'ler', 'leitura', 'historia', 'texto', 'pagina', 'capitulo', 'biblioteca', 'book'], fallbackEmoji: '📚', prompt: 'open book illustration for children worksheet' },
  { id: 'letra', category: 'leitura', label: 'Letras', keywords: ['letra', 'letras', 'alfabeto', 'abc', 'silaba', 'vogal', 'consoante', 'maiuscula', 'minuscula'], fallbackEmoji: '🔤', prompt: 'alphabet letters illustration for children worksheet' },
  { id: 'palavra', category: 'leitura', label: 'Palavras', keywords: ['palavra', 'palavras', 'vocabulario', 'sinonimo', 'antonimo', 'significado', 'dicionario'], fallbackEmoji: '💬', prompt: 'word bubble illustration for children worksheet' },
  { id: 'historia', category: 'leitura', label: 'História', keywords: ['historia', 'conto', 'narrativa', 'personagem', 'enredo', 'fabula', 'lenda', 'mito', 'conto'], fallbackEmoji: '📖', prompt: 'storybook illustration for children worksheet' },
  { id: 'escrita', category: 'leitura', label: 'Escrita', keywords: ['escrita', 'escrever', 'redacao', 'composicao', 'lapis', 'caneta', 'caderno', 'caligrafía'], fallbackEmoji: '✏️', prompt: 'pencil writing illustration for children worksheet' },
  { id: 'poema', category: 'leitura', label: 'Poema', keywords: ['poema', 'poesia', 'rima', 'verso', 'estrofe', 'ritmo', 'trovas'], fallbackEmoji: '🎭', prompt: 'poetry poem illustration for children worksheet' },
  { id: 'pontuacao', category: 'leitura', label: 'Pontuação', keywords: ['pontuacao', 'ponto', 'virgula', 'exclamacao', 'interrogacao', 'travessao', 'aspas'], fallbackEmoji: '❓', prompt: 'punctuation marks illustration for children worksheet' },
  { id: 'interpretacao', category: 'leitura', label: 'Interpretação', keywords: ['interpretacao', 'compreensao', 'entender', 'responder', 'pergunta', 'texto', 'inferir'], fallbackEmoji: '🤔', prompt: 'reading comprehension illustration for children worksheet' },

  // ── ROTINA ESCOLAR ────────────────────────────────────────────────────────────
  { id: 'escola', category: 'rotina_escolar', label: 'Escola', keywords: ['escola', 'colegio', 'classe', 'turma', 'sala', 'aula', 'ensino', 'educacao'], fallbackEmoji: '🏫', prompt: 'school building illustration for children worksheet' },
  { id: 'mochila', category: 'rotina_escolar', label: 'Mochila', keywords: ['mochila', 'mochilinha', 'material', 'escolar', 'bolsa', 'organizacao'], fallbackEmoji: '🎒', prompt: 'school backpack illustration for children worksheet' },
  { id: 'material', category: 'rotina_escolar', label: 'Material', keywords: ['material', 'lapis', 'caneta', 'borracha', 'tesoura', 'cola', 'caderno', 'regua', 'giz', 'pincel', 'tinta'], fallbackEmoji: '✏️', prompt: 'school supplies illustration for children worksheet' },
  { id: 'professor', category: 'rotina_escolar', label: 'Professor', keywords: ['professor', 'professora', 'docente', 'mestre', 'educador', 'escola', 'lousa', 'quadro'], fallbackEmoji: '👩‍🏫', prompt: 'teacher illustration for children worksheet' },
  { id: 'aluno', category: 'rotina_escolar', label: 'Aluno', keywords: ['aluno', 'aluna', 'crianca', 'estudante', 'aprendiz', 'turma', 'colega', 'amigo'], fallbackEmoji: '🧒', prompt: 'student child illustration for children worksheet' },
  { id: 'recreio', category: 'rotina_escolar', label: 'Recreio', keywords: ['recreio', 'brincar', 'intervalo', 'jogar', 'correr', 'bola', 'pular', 'parque'], fallbackEmoji: '⚽', prompt: 'playground recess illustration for children worksheet' },
  { id: 'calendario', category: 'rotina_escolar', label: 'Calendário', keywords: ['calendario', 'data', 'mes', 'dia', 'semana', 'hoje', 'ontem', 'amanha', 'ano'], fallbackEmoji: '📅', prompt: 'calendar illustration for children worksheet' },
  { id: 'computador', category: 'rotina_escolar', label: 'Tecnologia', keywords: ['computador', 'tablet', 'tecnologia', 'internet', 'digital', 'tela', 'mouse', 'teclado'], fallbackEmoji: '💻', prompt: 'computer tablet illustration for children worksheet' },
  { id: 'refeicao', category: 'rotina_escolar', label: 'Refeição', keywords: ['refeicao', 'lanche', 'almoco', 'merenda', 'comer', 'beber', 'alimentacao', 'cantina'], fallbackEmoji: '🍱', prompt: 'school lunch meal illustration for children worksheet' },
  { id: 'higiene', category: 'rotina_escolar', label: 'Higiene', keywords: ['higiene', 'lavar', 'maos', 'escova', 'dentes', 'banho', 'limpar', 'saude'], fallbackEmoji: '🧼', prompt: 'hygiene washing hands illustration for children worksheet' },
  { id: 'transporte', category: 'rotina_escolar', label: 'Transporte', keywords: ['transporte', 'onibus', 'carro', 'bicicleta', 'vir', 'ir', 'escola', 'caminho'], fallbackEmoji: '🚌', prompt: 'school bus transportation illustration for children worksheet' },
  { id: 'regras', category: 'rotina_escolar', label: 'Regras', keywords: ['regras', 'combinados', 'respeito', 'ordem', 'disciplina', 'normas', 'ouvir', 'silencio'], fallbackEmoji: '📋', prompt: 'classroom rules illustration for children worksheet' },

  // ── CIÊNCIAS ──────────────────────────────────────────────────────────────────
  { id: 'planta', category: 'ciencias', label: 'Planta', keywords: ['planta', 'arvore', 'flor', 'folha', 'semente', 'natureza', 'raiz', 'caule', 'florescer', 'jardim'], fallbackEmoji: '🌱', prompt: 'plant growth illustration for children worksheet' },
  { id: 'sol', category: 'ciencias', label: 'Sol', keywords: ['sol', 'luz', 'calor', 'energia', 'astro', 'dia', 'ensolarado', 'rayos', 'brilho'], fallbackEmoji: '☀️', prompt: 'sun illustration for children worksheet' },
  { id: 'chuva', category: 'ciencias', label: 'Chuva', keywords: ['chuva', 'agua', 'nuvem', 'tempestade', 'clima', 'tempo', 'trovao', 'relampago', 'chuvoso'], fallbackEmoji: '🌧️', prompt: 'rain cloud illustration for children worksheet' },
  { id: 'corpo', category: 'ciencias', label: 'Corpo Humano', keywords: ['corpo', 'humano', 'cabeca', 'braco', 'perna', 'maos', 'pes', 'orgao', 'saude', 'musculos', 'osso'], fallbackEmoji: '🫀', prompt: 'human body illustration for children worksheet' },
  { id: 'espaco', category: 'ciencias', label: 'Espaço', keywords: ['espaco', 'planetas', 'planeta', 'estrela', 'lua', 'cosmos', 'universo', 'sistema', 'solar', 'astronomia'], fallbackEmoji: '🌍', prompt: 'space planet illustration for children worksheet' },
  { id: 'agua', category: 'ciencias', label: 'Água', keywords: ['agua', 'liquido', 'rio', 'mar', 'oceano', 'lago', 'cachoeira', 'chuva', 'ciclo', 'hidrico'], fallbackEmoji: '💧', prompt: 'water drop illustration for children worksheet' },
  { id: 'reciclagem', category: 'ciencias', label: 'Reciclagem', keywords: ['reciclagem', 'lixo', 'reciclar', 'meio', 'ambiente', 'sustentabilidade', 'verde', 'ecologia', 'planeta'], fallbackEmoji: '♻️', prompt: 'recycling environment illustration for children worksheet' },
  { id: 'laboratorio', category: 'ciencias', label: 'Laboratório', keywords: ['laboratorio', 'experimento', 'ciencia', 'teste', 'tubo', 'microscopio', 'quimica', 'fisica'], fallbackEmoji: '🔬', prompt: 'science laboratory illustration for children worksheet' },
  { id: 'alimento', category: 'ciencias', label: 'Alimentação', keywords: ['alimento', 'comida', 'fruta', 'verdura', 'legume', 'nutricao', 'vitamina', 'saudavel', 'alimentacao'], fallbackEmoji: '🍎', prompt: 'healthy food fruit illustration for children worksheet' },
  { id: 'estacoes', category: 'ciencias', label: 'Estações', keywords: ['estacao', 'estacoes', 'inverno', 'verao', 'primavera', 'outono', 'tempo', 'clima', 'frio', 'quente'], fallbackEmoji: '🍂', prompt: 'seasons nature illustration for children worksheet' },
  { id: 'magnetismo', category: 'ciencias', label: 'Magnetismo', keywords: ['ima', 'iman', 'magnetismo', 'atracao', 'repulsao', 'ferro', 'magnet', 'polo', 'campo'], fallbackEmoji: '🧲', prompt: 'magnet science illustration for children worksheet' },
  { id: 'luz', category: 'ciencias', label: 'Luz', keywords: ['luz', 'sombra', 'reflexo', 'optica', 'cores', 'arco', 'iris', 'lampada', 'brilho', 'escuro'], fallbackEmoji: '🌈', prompt: 'light rainbow illustration for children worksheet' },

  // ── EMOCIONAL ────────────────────────────────────────────────────────────────
  { id: 'feliz', category: 'emocional', label: 'Feliz', keywords: ['feliz', 'alegre', 'contente', 'sorrindo', 'alegria', 'animado', 'satisfeito', 'empolgado', 'radiante'], fallbackEmoji: '😊', prompt: 'happy child face illustration for children worksheet' },
  { id: 'triste', category: 'emocional', label: 'Triste', keywords: ['triste', 'chorando', 'tristeza', 'chateado', 'magoado', 'decepcionado', 'desanimado', 'lamentando'], fallbackEmoji: '😢', prompt: 'sad face illustration for children worksheet' },
  { id: 'bravo', category: 'emocional', label: 'Com raiva', keywords: ['bravo', 'raiva', 'irritado', 'nervoso', 'frustrado', 'chateado', 'zangado', 'furioso'], fallbackEmoji: '😠', prompt: 'angry face illustration for children worksheet' },
  { id: 'medo', category: 'emocional', label: 'Com medo', keywords: ['medo', 'assustado', 'fear', 'ansioso', 'apreensivo', 'preocupado', 'receio', 'amedrontado'], fallbackEmoji: '😨', prompt: 'scared fear face illustration for children worksheet' },
  { id: 'surpreso', category: 'emocional', label: 'Surpreso', keywords: ['surpreso', 'surpresa', 'espantado', 'chocado', 'admirado', 'incrível', 'inesperado'], fallbackEmoji: '😮', prompt: 'surprised face illustration for children worksheet' },
  { id: 'orgulhoso', category: 'emocional', label: 'Orgulhoso', keywords: ['orgulhoso', 'orgulho', 'conquista', 'vitoria', 'consegui', 'fiz', 'capaz', 'exito'], fallbackEmoji: '🥹', prompt: 'proud happy child illustration for children worksheet' },
  { id: 'calmo', category: 'emocional', label: 'Calmo', keywords: ['calmo', 'tranquilo', 'relaxado', 'paz', 'sereno', 'quieto', 'respirar', 'sossegado'], fallbackEmoji: '😌', prompt: 'calm peaceful face illustration for children worksheet' },
  { id: 'amizade', category: 'emocional', label: 'Amizade', keywords: ['amigo', 'amiga', 'amizade', 'colega', 'juntos', 'companheiro', 'parceiro', 'turma', 'grupo'], fallbackEmoji: '🤝', prompt: 'friendship children illustration for children worksheet' },
  { id: 'familia', category: 'emocional', label: 'Família', keywords: ['familia', 'mae', 'pai', 'irmaos', 'parentes', 'casa', 'lar', 'avos', 'tios', 'filhos'], fallbackEmoji: '👨‍👩‍👧', prompt: 'family illustration for children worksheet' },
  { id: 'amor', category: 'emocional', label: 'Amor', keywords: ['amor', 'carinho', 'cuidado', 'afeto', 'abraco', 'gentileza', 'bondade', 'solidariedade', 'coração'], fallbackEmoji: '❤️', prompt: 'love heart illustration for children worksheet' },
  { id: 'coragem', category: 'emocional', label: 'Coragem', keywords: ['coragem', 'corajoso', 'bravo', 'forte', 'determinado', 'desafio', 'tentar', 'superar'], fallbackEmoji: '💪', prompt: 'courage strong child illustration for children worksheet' },
  { id: 'curiosidade', category: 'emocional', label: 'Curiosidade', keywords: ['curiosidade', 'curioso', 'perguntar', 'descobrir', 'explorar', 'investigar', 'aprender', 'duvida'], fallbackEmoji: '🔍', prompt: 'curious child exploring illustration for children worksheet' },
];

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function findPictogramByText(text: string): Pictogram | undefined {
  if (!text) return undefined;

  const normText = normalize(text);
  const words = normText.split(/\W+/).filter(w => w.length > 2);
  if (words.length === 0) return undefined;

  let bestMatch: Pictogram | undefined;
  let bestScore = 0;

  for (const pic of pictogramLibrary) {
    let score = 0;
    for (const kw of pic.keywords) {
      const normKw = normalize(kw);
      for (const word of words) {
        if (word === normKw) {
          score += 4;
        } else if (word.length > 3 && normKw.startsWith(word)) {
          score += 2;
        } else if (normKw.length > 3 && word.startsWith(normKw)) {
          score += 2;
        } else if (word.length > 4 && normKw.includes(word)) {
          score += 1;
        }
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = pic;
    }
  }

  return bestScore > 0 ? bestMatch : undefined;
}
