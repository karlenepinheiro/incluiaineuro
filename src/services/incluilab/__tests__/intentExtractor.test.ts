import { describe, expect, it } from 'vitest';
import { extractCanonicalIntent } from '../intentExtractor';

describe('extractCanonicalIntent', () => {
  it('extrai "10 questões" como requestedQuestionCount = 10', () => {
    const request = extractCanonicalIntent('Atividade de frações para o 4º ano com 10 questões');
    expect(request.requestedQuestionCount).toBe(10);
  });

  it('extrai quantidade por extenso ("dez questões")', () => {
    const request = extractCanonicalIntent('Crie uma atividade com dez questões sobre o sistema solar');
    expect(request.requestedQuestionCount).toBe(10);
  });

  it('não define requestedQuestionCount quando o usuário não especifica quantidade', () => {
    const request = extractCanonicalIntent('Atividade sobre animais da fazenda');
    expect(request.requestedQuestionCount).toBeUndefined();
  });

  it('detecta requestType "avaliacao" a partir de palavras-chave', () => {
    const request = extractCanonicalIntent('Preciso de uma avaliação sobre frações');
    expect(request.requestType).toBe('avaliacao');
  });

  it('detecta requestType "adaptacao" quando há anexo, mesmo sem palavra-chave', () => {
    const request = extractCanonicalIntent('reconstrua esta atividade', { hasAttachment: true });
    expect(request.requestType).toBe('adaptacao');
  });

  it('usa requestType "atividade" como padrão', () => {
    const request = extractCanonicalIntent('Atividade sobre o ciclo da água');
    expect(request.requestType).toBe('atividade');
  });

  it('respeita requestTypeHint explícito da UI sobre a inferência textual', () => {
    const request = extractCanonicalIntent('crie uma prova difícil', { requestTypeHint: 'adaptacao' });
    expect(request.requestType).toBe('adaptacao');
  });

  it('requestTypeHint explícito de atividade vence palavras de avaliação quando a UI escolheu atividade geral', () => {
    const request = extractCanonicalIntent('crie uma prova difícil', { requestTypeHint: 'atividade' });
    expect(request.requestType).toBe('atividade');
  });

  it('propaga originalActivityType para adaptações sem depender de banco', () => {
    const request = extractCanonicalIntent('Caça-palavras dos animais', {
      hasAttachment: true,
      requestTypeHint: 'adaptacao',
      originalActivityType: 'word_search',
    });
    expect(request.requestType).toBe('adaptacao');
    expect(request.originalActivityType).toBe('word_search');
  });

  it('propaga originalActivityType=table para adaptação de tabela', () => {
    const request = extractCanonicalIntent('Tabela de frações', {
      hasAttachment: true,
      requestTypeHint: 'adaptacao',
      originalActivityType: 'table',
    });
    expect(request.requestType).toBe('adaptacao');
    expect(request.originalActivityType).toBe('table');
  });

  it('visualMode = "none" quando não há pedido visual', () => {
    const request = extractCanonicalIntent('Atividade sobre verbos no presente');
    expect(request.visualMode).toBe('none');
    expect(request.visualModeSource).toBe('inferred_default');
  });

  it('visualMode = "pictogram" para "com apoio visual"', () => {
    const request = extractCanonicalIntent('Faça uma atividade com apoio visual sobre animais');
    expect(request.visualMode).toBe('pictogram');
    expect(request.visualModeSource).toBe('user_explicit');
  });

  it('visualMode = "pictogram" para "com pictogramas"', () => {
    const request = extractCanonicalIntent('Atividade com pictogramas sobre rotina escolar');
    expect(request.visualMode).toBe('pictogram');
  });

  it('visualMode = "illustration" para "ilustrações de caravelas" — NÃO é tratado como pictograma', () => {
    const request = extractCanonicalIntent('faça uma atividade sobre o descobrimento com ilustrações de caravelas');
    expect(request.visualMode).toBe('illustration');
    expect(request.visualModeSource).toBe('user_explicit');
  });

  it('visualMode = "illustration" para "desenho de um leão", diferenciado de pictograma', () => {
    const request = extractCanonicalIntent('atividade sobre a savana com desenho de um leão');
    expect(request.visualMode).toBe('illustration');
  });

  it('aluno é opcional — funciona normalmente sem studentContext', () => {
    const request = extractCanonicalIntent('Atividade sobre plantas');
    expect(request.studentContext).toBeUndefined();
    expect(request.requestType).toBe('atividade');
  });

  it('quando informado, studentContext é propagado no request', () => {
    const request = extractCanonicalIntent('Atividade sobre plantas', { studentContext: 'Aluno com TEA, nível 2 de suporte' });
    expect(request.studentContext).toBe('Aluno com TEA, nível 2 de suporte');
  });

  it('extrai disciplina e série quando presentes no texto', () => {
    const request = extractCanonicalIntent('Atividade de matemática para o 3º ano sobre multiplicação');
    expect(request.discipline).toBe('Matemática');
    expect(request.grade).toBe('3º ano');
  });

  it('detecta texto introdutório como requisito canônico, sem perder quantidade e série', () => {
    const request = extractCanonicalIntent('Faça uma atividade sobre frações para o 6º ano com um texto introdutório e 15 questões.');
    expect(request.requiresBaseText).toBe(true);
    expect(request.baseTextSize).toBe('unspecified');
    expect(request.requestedQuestionCount).toBe(15);
    expect(request.grade).toBe('6º ano');
  });

  it('extrai tamanho aproximado de texto-base em caracteres', () => {
    const request = extractCanonicalIntent('Atividade com texto de aproximadamente 3 mil caracteres e 15 questões sobre frações');
    expect(request.requiresBaseText).toBe(true);
    expect(request.baseTextSize).toBe('custom');
    expect(request.baseTextApproxChars).toBe(3000);
    expect(request.requestedQuestionCount).toBe(15);
  });

  it('detecta texto pequeno/curto/breve como small', () => {
    expect(extractCanonicalIntent('Faça uma atividade com texto pequeno sobre água').baseTextSize).toBe('small');
    expect(extractCanonicalIntent('Faça uma atividade com texto curto sobre água').baseTextSize).toBe('small');
    expect(extractCanonicalIntent('Faça uma atividade com texto breve sobre água').baseTextSize).toBe('small');
    expect(extractCanonicalIntent('Faça uma atividade com um textinho sobre água').baseTextSize).toBe('small');
    expect(extractCanonicalIntent('Faça uma atividade com uma leitura rápida sobre água').baseTextSize).toBe('small');
  });

  it('detecta texto médio como medium', () => {
    expect(extractCanonicalIntent('Faça uma atividade com texto médio sobre água').baseTextSize).toBe('medium');
    expect(extractCanonicalIntent('Faça uma atividade com texto de tamanho médio sobre água').baseTextSize).toBe('medium');
    expect(extractCanonicalIntent('Faça uma atividade com texto nem muito curto nem muito longo sobre água').baseTextSize).toBe('medium');
  });

  it('detecta texto grande/longo/mais extenso como large', () => {
    expect(extractCanonicalIntent('Faça uma atividade com texto grande sobre água').baseTextSize).toBe('large');
    expect(extractCanonicalIntent('Faça uma atividade com texto longo sobre água').baseTextSize).toBe('large');
    expect(extractCanonicalIntent('Faça uma atividade com texto mais extenso sobre água').baseTextSize).toBe('large');
    expect(extractCanonicalIntent('Faça uma atividade com texto completo sobre água').baseTextSize).toBe('large');
    expect(extractCanonicalIntent('Faça uma atividade com texto detalhado sobre água').baseTextSize).toBe('large');
    expect(extractCanonicalIntent('Faça uma atividade com texto aprofundado sobre água').baseTextSize).toBe('large');
    expect(extractCanonicalIntent('Faça uma atividade com texto bem desenvolvido sobre água').baseTextSize).toBe('large');
  });

  it('texto de 3000 caracteres vira custom=3000', () => {
    const request = extractCanonicalIntent('Faça uma atividade com texto de 3000 caracteres sobre água');
    expect(request.baseTextSize).toBe('custom');
    expect(request.baseTextApproxChars).toBe(3000);
  });

  it('texto grande de 2000 caracteres usa custom=2000 como prioridade', () => {
    const request = extractCanonicalIntent('Faça uma atividade com texto grande de 2000 caracteres sobre água');
    expect(request.baseTextSize).toBe('custom');
    expect(request.baseTextApproxChars).toBe(2000);
  });

  it('texto de 4.500 caracteres interpreta separador de milhar', () => {
    const request = extractCanonicalIntent('Faça uma atividade com texto de 4.500 caracteres sobre água');
    expect(request.baseTextSize).toBe('custom');
    expect(request.baseTextApproxChars).toBe(4500);
  });

  it('interpreta custom por palavras, intervalo, máximo e mínimo explícitos', () => {
    expect(extractCanonicalIntent('Faça uma atividade com texto de 2.500 palavras sobre água').baseTextConstraint).toEqual({
      unit: 'words',
      target: 2500,
    });
    expect(extractCanonicalIntent('Faça uma atividade com texto entre 2.000 e 2.500 caracteres').baseTextConstraint).toEqual({
      unit: 'characters',
      min: 2000,
      max: 2500,
    });
    expect(extractCanonicalIntent('Faça uma atividade com texto até 1.500 caracteres').baseTextConstraint).toEqual({
      unit: 'characters',
      max: 1500,
    });
    expect(extractCanonicalIntent('Faça uma atividade com texto no mínimo 3.000 caracteres').baseTextConstraint).toEqual({
      unit: 'characters',
      min: 3000,
    });
    expect(extractCanonicalIntent('Faça uma atividade com texto cerca de 4.000 caracteres').baseTextConstraint).toEqual({
      unit: 'characters',
      target: 4000,
    });
  });

  it('não confunde quantidade de questões com quantidade de caracteres do texto-base', () => {
    const request = extractCanonicalIntent('Faça uma atividade com texto e 10 questões sobre água');
    expect(request.requestedQuestionCount).toBe(10);
    expect(request.baseTextSize).toBe('unspecified');
    expect(request.baseTextConstraint).toBeUndefined();
  });

  it('atividade grande sem contexto de texto não vira texto grande', () => {
    const request = extractCanonicalIntent('Faça uma atividade grande sobre água');
    expect(request.baseTextSize).toBe('unspecified');
    expect(request.requiresBaseText).toBe(false);
  });

  it('detecta pedido explícito de exercícios complementares/mistos', () => {
    expect(extractCanonicalIntent('Adapte o caça-palavras e inclua exercícios complementares').allowSupplementaryExercises).toBe(true);
    expect(extractCanonicalIntent('Adapte como atividade mista').allowSupplementaryExercises).toBe(true);
    expect(extractCanonicalIntent('Adapte este caça-palavras').allowSupplementaryExercises).toBe(false);
  });

  it('hasAttachment reflete a opção passada', () => {
    const withFile = extractCanonicalIntent('adaptar', { hasAttachment: true });
    const withoutFile = extractCanonicalIntent('adaptar', { hasAttachment: false });
    expect(withFile.hasAttachment).toBe(true);
    expect(withoutFile.hasAttachment).toBe(false);
  });

  // ─── Sprint 2B.3 (item 7): números compostos por extenso, 1 a 50 ──────────
  describe('quantidade — números compostos por extenso (item 7)', () => {
    it('"vinte e cinco questões" → 25', () => {
      expect(extractCanonicalIntent('Prova com vinte e cinco questões').requestedQuestionCount).toBe(25);
    });
    it('"trinta questões" → 30', () => {
      expect(extractCanonicalIntent('Atividade com trinta questões').requestedQuestionCount).toBe(30);
    });
    it('"trinta e cinco questões" → 35', () => {
      expect(extractCanonicalIntent('Atividade com trinta e cinco questões').requestedQuestionCount).toBe(35);
    });
    it('"quarenta questões" → 40', () => {
      expect(extractCanonicalIntent('Atividade com quarenta questões').requestedQuestionCount).toBe(40);
    });
    it('"quarenta e oito questões" → 48', () => {
      expect(extractCanonicalIntent('Atividade com quarenta e oito questões').requestedQuestionCount).toBe(48);
    });
    it('"cinquenta questões" → 50', () => {
      expect(extractCanonicalIntent('Atividade com cinquenta questões').requestedQuestionCount).toBe(50);
    });
    it('dígitos continuam com prioridade sobre extenso', () => {
      expect(extractCanonicalIntent('Atividade com 25 questões').requestedQuestionCount).toBe(25);
      expect(extractCanonicalIntent('Atividade com 48 exercícios').requestedQuestionCount).toBe(48);
    });
    it('números simples 1-20 continuam funcionando (regressão)', () => {
      expect(extractCanonicalIntent('Atividade com quinze questões').requestedQuestionCount).toBe(15);
      expect(extractCanonicalIntent('Atividade com dezenove questões').requestedQuestionCount).toBe(19);
    });
  });

  // ─── Sprint 2B.3 (item 8): cobertura de ilustração/pictograma (Auditoria 2B.2-D) ─
  describe('visualMode — cobertura ampliada (item 8)', () => {
    it('"com ilustrações" → illustration', () => {
      const r = extractCanonicalIntent('Quero uma atividade com ilustrações sobre o sistema solar');
      expect(r.visualMode).toBe('illustration');
    });
    it('"ilustrações premium" → illustration (caso relatado na Auditoria 2B.2)', () => {
      const r = extractCanonicalIntent('faça uma atividade com ilustrações premium sobre o Brasil colonial');
      expect(r.visualMode).toBe('illustration');
    });
    it('"atividade ilustrada" → illustration', () => {
      const r = extractCanonicalIntent('quero uma atividade ilustrada sobre os planetas');
      expect(r.visualMode).toBe('illustration');
    });
    it('"quero imagens" → illustration', () => {
      const r = extractCanonicalIntent('quero imagens para a atividade de ciências');
      expect(r.visualMode).toBe('illustration');
    });
    it('"com desenhos" → illustration', () => {
      const r = extractCanonicalIntent('atividade com desenhos sobre animais da fazenda');
      expect(r.visualMode).toBe('illustration');
    });
    it('"com imagens de apoio" → pictogram (não illustration)', () => {
      const r = extractCanonicalIntent('atividade com imagens de apoio sobre rotina escolar');
      expect(r.visualMode).toBe('pictogram');
    });
    it('"apoio visual" continua pictogram (regressão)', () => {
      expect(extractCanonicalIntent('atividade com apoio visual').visualMode).toBe('pictogram');
    });
    it('"ilustração de caravelas" continua illustration (regressão)', () => {
      expect(extractCanonicalIntent('atividade com ilustração de caravelas').visualMode).toBe('illustration');
    });
  });

  describe('outputFormat — pedido natural de arquivo', () => {
    it('A — atividade de Ciências sobre água em Word preserva intent, texto-base e 15 questões', () => {
      const request = extractCanonicalIntent('Faça uma atividade de Ciências sobre água para o 7º ano com texto e 15 questões em Word.');
      expect(request.requestType).toBe('atividade');
      expect(request.discipline).toBe('Ciências');
      expect(request.grade).toBe('7º ano');
      expect(request.requiresBaseText).toBe(true);
      expect(request.requestedQuestionCount).toBe(15);
      expect(request.outputFormat).toBe('docx');
    });

    it('B — avaliação de frações com 10 questões em PDF', () => {
      const request = extractCanonicalIntent('Faça uma avaliação de frações com 10 questões em PDF.');
      expect(request.requestType).toBe('avaliacao');
      expect(request.requestedQuestionCount).toBe(10);
      expect(request.outputFormat).toBe('pdf');
    });

    it('C — adaptação com contexto do aluno entregue em imagem', () => {
      const request = extractCanonicalIntent('Adapte esta atividade para o aluno selecionado e entregue em imagem.', {
        hasAttachment: true,
        studentContext: 'Contexto pedagógico real do aluno.',
        requestTypeHint: 'adaptacao',
      });
      expect(request.requestType).toBe('adaptacao');
      expect(request.studentContext).toBe('Contexto pedagógico real do aluno.');
      expect(request.outputFormat).toBe('png');
    });

    it('"em Word" → docx', () => {
      const request = extractCanonicalIntent('Faça uma atividade sobre água em Word');
      expect(request.outputFormat).toBe('docx');
      expect(request.outputModality).toBe('textual');
    });

    it('"DOCX" → docx', () => {
      expect(extractCanonicalIntent('Atividade de ciências DOCX').outputFormat).toBe('docx');
    });

    it('"arquivo editável" → docx', () => {
      expect(extractCanonicalIntent('Quero um arquivo editável sobre frações').outputFormat).toBe('docx');
    });

    it('"em PDF" → pdf', () => {
      const request = extractCanonicalIntent('Faça uma avaliação de frações em PDF');
      expect(request.outputFormat).toBe('pdf');
      expect(request.outputModality).toBe('textual');
    });

    it('"em imagem" → png', () => {
      const request = extractCanonicalIntent('Faça uma atividade sobre animais em imagem');
      expect(request.outputFormat).toBe('png');
      expect(request.outputModality).toBe('visual');
    });

    it('"em PNG" → png', () => {
      const request = extractCanonicalIntent('Faça uma atividade sobre animais em PNG');
      expect(request.outputFormat).toBe('png');
      expect(request.outputModality).toBe('visual');
    });

    it('"com imagens" não vira PNG', () => {
      const request = extractCanonicalIntent('Faça uma atividade com imagens sobre animais');
      expect(request.outputFormat).toBe('unspecified');
      expect(request.visualMode).toBe('illustration');
    });

    it('"PDF colorido" separa formato e estilo', () => {
      const request = extractCanonicalIntent('Faça uma avaliação de Ciências em PDF colorida');
      expect(request.outputFormat).toBe('pdf');
      expect(request.outputModality).toBe('textual');
      expect(request.requestedVisualStyle).toBe('colorido');
    });

    it('"Word preto e branco" separa formato e estilo', () => {
      const request = extractCanonicalIntent('Faça uma atividade em Word preto e branco');
      expect(request.outputFormat).toBe('docx');
      expect(request.requestedVisualStyle).toBe('preto_e_branco');
    });

    it('atividade bonita em Word continua textual e preserva estilo futuro', () => {
      const request = extractCanonicalIntent('Faça uma atividade bonita em Word colorida');
      expect(request.outputFormat).toBe('docx');
      expect(request.outputModality).toBe('textual');
      expect(request.requestedVisualStyle).toBe('colorido');
    });

    it('atividade em imagem com ilustrações 3D é visual', () => {
      const request = extractCanonicalIntent('Faça uma atividade em imagem com ilustrações 3D');
      expect(request.outputFormat).toBe('png');
      expect(request.outputModality).toBe('visual');
      expect(request.visualMode).toBe('illustration');
    });

    it('folha ilustrada/material visual seguem para PNG visual sem conectar geração de imagem', () => {
      expect(extractCanonicalIntent('Faça uma folha ilustrada sobre água').outputFormat).toBe('png');
      expect(extractCanonicalIntent('Faça um material visual sobre água').outputModality).toBe('visual');
    });

    it('sem formato → unspecified', () => {
      expect(extractCanonicalIntent('Faça uma atividade de História sobre Roma com texto e 15 questões').outputFormat).toBe('unspecified');
    });

    it('JPG/JPEG é normalizado para PNG com aviso discreto', () => {
      const request = extractCanonicalIntent('Faça uma atividade em JPEG');
      expect(request.outputFormat).toBe('png');
      expect(request.normalizedOutputFormatNotice).toBe('A atividade será entregue em PNG.');
    });

    it('pedido natural prevalece sobre outputFormatHint', () => {
      const request = extractCanonicalIntent('Quero em Word', { outputFormatHint: 'pdf' });
      expect(request.outputFormat).toBe('docx');
    });

    it('outputFormatHint preenche apenas quando o texto não informou formato', () => {
      const request = extractCanonicalIntent('Atividade sobre Roma', { outputFormatHint: 'png' });
      expect(request.outputFormat).toBe('png');
    });
  });
});
