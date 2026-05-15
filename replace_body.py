"""Replace generateStudentProfilePDF body with premium visual implementation."""
import re

FILE = 'src/services/exportService.ts'

NEW_BODY = r"""    const jsPDF = await loadJsPDF();
    const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W     = doc.internal.pageSize.getWidth();
    const H     = doc.internal.pageSize.getHeight();
    const maxW  = W - FL - FR;

    const internalCode = makeAuditCode('FICHA', student.id);
    const schoolForDoc = cfg.logoEscola ? school : null;

    // Pre-processa foto circular
    let circularPhoto: string | undefined;
    if (cfg.fotoAluno && student.photoUrl) {
      try { circularPhoto = await cropCircle(student.photoUrl); } catch {}
    }

    // Dados normalizados
    const age         = calcAge(student.birthDate);
    const rawSex      = (student as any).gender || (student as any).sex || '';
    const gLabel      = rawSex === 'M' ? 'Masculino' : rawSex === 'F' ? 'Feminino' : rawSex || 'Não informado';
    const supLvl      = (student as any).supportLevel || (student as any).support_level || '';
    const diagArr     = student.diagnosis || [];
    const cidVal      = typeof student.cid === 'string' ? student.cid
                      : Array.isArray(student.cid) ? (student.cid as string[]).join(', ') : '';
    const status      = (student as any).tipo_aluno === 'com_laudo' ? 'Com Laudo'
                      : (student as any).tipo_aluno === 'em_triagem' ? 'Em Triagem' : 'Em Preenchimento';
    const shift       = student.shift || (student as any).turno || '';
    const medication  = (student as any).medication || '';
    const uniqueCode  = (student as any).unique_code || student.id?.slice(-8) || '';
    const recomendacoes   = (student as any).recomendacoes   || (student as any).recommendations || '';
    const encaminhamentos = (student as any).encaminhamentos || (student as any).referrals || '';
    const adaptacoes  = (student as any).adaptacoes || (student as any).adaptations || [];
    const recursos    = (student as any).recursos    || (student as any).resources    || [];
    const adaptItems  = [...adaptacoes, ...recursos].filter((it: any) => it?.trim?.());
    const interacaoSocial = (student as any).interacaoSocial || (student as any).social_interaction || '';
    const diagStr     = [diagArr[0] || '', cidVal].filter(Boolean).join(' - ') || 'Não informado';
    const schoolName  = schoolForDoc?.schoolName?.trim() || (student as any).schoolName || '';
    const cityLine    = [schoolForDoc?.city, schoolForDoc?.state].filter(Boolean).join(' - ');
    const emitDate    = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    const pBottom     = pf_pfBottom(H);
    const pfHeader    = (): number => pf_header(doc, student.name, internalCode, schoolForDoc);

    // ==============================================================
    // PAGINA 1 - CAPA HERO + RESUMO + EQUIPE ESCOLAR
    // ==============================================================

    // Cabecalho da pagina 1
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); sc(doc, PF_SL900);
    doc.text((schoolName || 'Escola não informada').toUpperCase(), FL, 7.5);
    if (cityLine) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); sc(doc, PF_SL500);
      doc.text(cityLine, FL, 11.5);
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); sc(doc, BRAND);
    doc.text('FICHA DO ALUNO', W - FR, 7.5, { align: 'right' });
    doc.setFont('courier', 'normal'); doc.setFontSize(7); sc(doc, PF_SL400);
    doc.text(`Doc.: ${internalCode}`, W - FR, 11.5, { align: 'right' });
    sdd(doc, PF_SL200); doc.setLineWidth(0.25); doc.line(FL, 13, W - FR, 13);

    // Hero Card
    let y = 16;
    const heroH = 70;
    sf(doc, WHITE); sdd(doc, PF_SL200); doc.setLineWidth(0.25);
    doc.roundedRect(FL, y, maxW, heroH, 3, 3, 'FD');
    // Barra de acento laranja a direita
    sf(doc, PF_ORANGE_ACC); doc.rect(FL + maxW - 2, y + 3, 2, heroH - 6, 'F');

    // Subtitulo
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); sc(doc, PF_SL400);
    doc.text('DOCUMENTAÇÃO EDUCACIONAL INCLUSIVA', FL + 8, y + 9);

    // Box do codigo (canto superior direito do hero)
    const codeBoxW = 52, codeBoxX = FL + maxW - codeBoxW - 6;
    sf(doc, GBKG); sdd(doc, PF_SL200); doc.setLineWidth(0.2);
    doc.roundedRect(codeBoxX, y + 4, codeBoxW, 14, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6); sc(doc, PF_SL400);
    doc.text('CÓDIGO DO DOCUMENTO', codeBoxX + codeBoxW / 2, y + 9.5, { align: 'center' });
    doc.setFont('courier', 'bold'); doc.setFontSize(5.5); sc(doc, PF_SL900);
    doc.text(internalCode.substring(0, 26), codeBoxX + codeBoxW / 2, y + 14.5, { align: 'center' });

    // Titulo do documento
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); sc(doc, PF_SL900);
    doc.text('FICHA DO ALUNO', FL + 8, y + 22);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); sc(doc, PF_SL500);
    doc.text(`Emissão: ${emitDate}`, FL + 8, y + 28);

    // Divisoria interna do hero
    sf(doc, PF_SL100); doc.rect(FL + 6, y + 32, maxW - 12, 0.4, 'F');

    // Bloco do aluno
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); sc(doc, PF_SL400);
    doc.text('ALUNO', FL + 8, y + 37);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); sc(doc, PF_SL900);
    const nameLines = doc.splitTextToSize(student.name, codeBoxX - FL - 14) as string[];
    doc.text(nameLines[0], FL + 8, y + 44);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); sc(doc, PF_SL500);
    doc.text(`Cód. Aluno: ${uniqueCode || '—'}`, FL + 8, y + 50);

    // Foto circular (se disponivel)
    if (circularPhoto) {
      try {
        const photoD = 16;
        doc.addImage(circularPhoto, 'PNG', FL + maxW - photoD - 8, y + 34, photoD, photoD);
      } catch {}
    }

    // 4 boxes de info na base do hero
    const boxRowY = y + 56, boxH2 = 11, boxGap = 3;
    const boxW    = (maxW - boxGap * 3) / 4;
    [
      { label: 'Série / Turma',    value: pf_val(student.grade), orange: false },
      { label: 'Turno',            value: pf_val(shift),          orange: false },
      { label: 'Nível de Suporte', value: pf_val(supLvl),         orange: false },
      { label: 'Status',           value: status,                  orange: status !== 'Em Preenchimento' },
    ].forEach((box, i) => {
      const bx  = FL + i * (boxW + boxGap);
      const bbg = box.orange ? PF_ORANGE_BG  : PF_SL100;
      const btx = box.orange ? PF_ORANGE_TXT : PF_SL700;
      const bbd = box.orange ? PF_ORANGE_BD  : PF_SL200;
      const blb = box.orange ? PF_ORANGE_ACC : PF_SL400;
      sf(doc, bbg); sdd(doc, bbd); doc.setLineWidth(0.2);
      doc.roundedRect(bx, boxRowY, boxW, boxH2, 2, 2, 'FD');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6); sc(doc, blb);
      doc.text(box.label.toUpperCase(), bx + 4, boxRowY + 4.5);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); sc(doc, btx);
      doc.text(box.value, bx + 4, boxRowY + 9.5);
    });
    y = y + heroH + 6;

    // Secao I: Resumo do Aluno
    y = pf_sectionTitle(doc, 'I', 'Resumo do Aluno', FL, y);
    y = pf_infoGrid(doc, [
      ['Nascimento',            pf_val(student.birthDate)],
      ['Idade',                 age || 'Não calculada'],
      ['Gênero',                gLabel],
      ['Diagnóstico principal', diagStr],
      ['Medicação',             pf_val(medication, 'Não usa medicação')],
      ['Cód. do documento',     internalCode],
    ], FL, y, maxW, 3);
    y += 4;

    // Secao II: Responsavel e Equipe Escolar
    if (y > pBottom - 48) { doc.addPage(); y = pfHeader(); }
    y = pf_sectionTitle(doc, 'II', 'Responsável e Equipe Escolar', FL, y);
    const rCardW = (maxW - 4) / 2, rCardH = 26;

    sf(doc, WHITE); sdd(doc, PF_SL200); doc.setLineWidth(0.25);
    doc.roundedRect(FL, y, rCardW, rCardH, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); sc(doc, PF_SL400);
    doc.text('RESPONSÁVEL LEGAL', FL + 4, y + 6);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); sc(doc, PF_SL900);
    doc.text(pf_val(student.guardianName), FL + 4, y + 13);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); sc(doc, PF_SL500);
    doc.text([student.guardianPhone?.trim(), student.guardianEmail?.trim()].filter(Boolean).join(' · ') || 'Não informado', FL + 4, y + 19);

    const rcx = FL + rCardW + 4;
    sf(doc, WHITE); sdd(doc, PF_SL200); doc.setLineWidth(0.25);
    doc.roundedRect(rcx, y, rCardW, rCardH, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); sc(doc, PF_SL400);
    doc.text('EQUIPE ESCOLAR', rcx + 4, y + 6);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); sc(doc, PF_SL700);
    doc.text(`Regente: ${pf_val(student.regentTeacher)}`, rcx + 4, y + 12);
    doc.text(`AEE: ${pf_val(student.aeeTeacher, 'Não atribuído')}`, rcx + 4, y + 17);
    doc.text(`Coordenação: ${pf_val(student.coordinator)}`, rcx + 4, y + 22);
    y += rCardH + 4;

    const profs = (student.professionals || []).filter((p: any) => p?.trim?.());
    if (profs.length > 0) { y = pf_chipList(doc, profs, FL, y, maxW, 'blue'); y += 2; }

    // ==============================================================
    // PAGINA 2 - MAPA PEDAGOGICO + CONTEXTO + OBSERVACOES
    // ==============================================================
    doc.addPage(); y = pfHeader();

    // Secao III: Mapa Pedagogico e Funcional
    y = pf_sectionTitle(doc, 'III', 'Mapa Pedagógico e Funcional', FL, y);
    y = pf_twoChipCards(doc,
      { title: 'Habilidades / Potencialidades', chips: student.abilities    || [], tone: 'green'  },
      { title: 'Dificuldades / Barreiras',      chips: student.difficulties || [], tone: 'orange' },
      FL, y, maxW,
    );
    const commStr  = (student.communication || []).filter((c: any) => c?.trim?.()).join(', ') || 'Em preenchimento';
    const stratStr = (student.strategies    || []).filter((s: any) => s?.trim?.()).join(', ') || 'Em preenchimento';
    y = pf_infoGrid(doc, [
      ['Formas de Comunicação',            commStr],
      ['Estratégias Pedagógicas Eficazes', stratStr],
      ['Adaptações e Recursos Necessários', adaptItems.length ? adaptItems.join(', ') : 'Em preenchimento'],
    ], FL, y, maxW, 3);
    y += 2;
    if (interacaoSocial?.trim()) {
      if (y > pBottom - 22) { doc.addPage(); y = pfHeader(); }
      y = pf_infoGrid(doc, [['Interação Social', interacaoSocial]], FL, y, maxW, 1);
      y += 2;
    }

    // Secao IV: Contexto Escolar e Familiar
    if (y > pBottom - 55) { doc.addPage(); y = pfHeader(); }
    y = pf_sectionTitle(doc, 'IV', 'Contexto Escolar e Familiar', FL, y);
    y = pf_twoTextCards(doc,
      { title: 'Histórico Escolar', text: student.schoolHistory || '' },
      { title: 'Contexto Familiar', text: student.familyContext  || '' },
      FL, y, maxW,
    );
    if (diagArr.length > 0) {
      if (y > pBottom - 18) { doc.addPage(); y = pfHeader(); }
      sf(doc, WHITE); sdd(doc, PF_SL200); doc.setLineWidth(0.25);
      doc.roundedRect(FL, y, maxW, 18, 2, 2, 'FD');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); sc(doc, PF_SL900);
      doc.text('Diagnósticos Registrados', FL + 4, y + 8);
      pf_chipList(doc, diagArr, FL + 4, y + 11, maxW - 8, 'blue');
      y += 21;
    }

    // Secao V: Observacoes e Recomendacoes
    if (y > pBottom - 38) { doc.addPage(); y = pfHeader(); }
    y = pf_sectionTitle(doc, 'V', 'Observações e Recomendações', FL, y);
    y = pf_twoTextCards(doc,
      { title: 'Observações Pedagógicas',   text: pf_val(student.observations, 'Não informado') },
      { title: 'Recomendações Pedagógicas', text: pf_val(recomendacoes,         'Não informado') },
      FL, y, maxW,
    );
    if (encaminhamentos?.trim()) {
      if (y > pBottom - 22) { doc.addPage(); y = pfHeader(); }
      y = pf_infoGrid(doc, [['Encaminhamentos', encaminhamentos]], FL, y, maxW, 1);
      y += 2;
    }

    // ==============================================================
    // PAGINA 3+ - REGISTROS COMPLEMENTARES (somente se houver dados)
    // ==============================================================
    const hasSupplementary =
      (cfg.ultimaAvaliacao      && extra.evolutions    && extra.evolutions.length    > 0) ||
      (cfg.agendamentos         && extra.appointments  && extra.appointments.length  > 0) ||
      (cfg.controleAtendimento  && extra.serviceRecords && extra.serviceRecords.length > 0) ||
      (cfg.documentosGerados    && extra.protocols     && extra.protocols.length     > 0) ||
      (cfg.analiseLaudo         && extra.documents     && extra.documents.some((d: any) => d.type === 'Laudo' || d.type === 'Relatorio')) ||
      (cfg.fichasComplementares && extra.obsForms      && extra.obsForms.length      > 0);

    if (hasSupplementary) {
      doc.addPage(); y = pfHeader();
      const CRITERIA_NAMES = [
        'Comunicação Expressiva', 'Interação Social', 'Autonomia (AVD)', 'Autorregulação',
        'Atenção Sustentada', 'Compreensão', 'Motricidade Fina', 'Motricidade Grossa',
        'Participação', 'Linguagem / Leitura',
      ];

      // Secao VI: Avaliacao Cognitiva e Funcional
      if (cfg.ultimaAvaliacao && extra.evolutions && extra.evolutions.length > 0) {
        const ev      = extra.evolutions[0];
        const scores: number[] = ev.scores || [];
        const avg      = scores.length > 0 ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : 0;
        const avgRound = Math.round(avg * 10) / 10;
        const avgPct   = Math.round((avg / 5) * 100);
        const strong   = CRITERIA_NAMES.filter((_, i) => (scores[i] ?? 0) >= 4);
        const priority = CRITERIA_NAMES.filter((_, i) => (scores[i] ?? 0) <= 2);
        const evDate2  = ev.date ? new Date(ev.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';

        if (y > pBottom - 58) { doc.addPage(); y = pfHeader(); }
        y = pf_sectionTitle(doc, 'VI', 'Avaliação Cognitiva e Funcional', FL, y);

        // 3 cards topo
        const topCardH = 42, topCardW = (maxW - 4) / 3;
        // Card azul: Media Geral
        sf(doc, PF_BLUE_TXT as [number,number,number]);
        doc.roundedRect(FL, y, topCardW, topCardH, 2, 2, 'F');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); sc(doc, [179, 210, 255] as [number,number,number]);
        doc.text('MÉDIA GERAL', FL + 4, y + 7);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(20); sc(doc, WHITE);
        doc.text(`${avgRound}/5`, FL + 4, y + 20);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); sc(doc, [179, 210, 255] as [number,number,number]);
        doc.text(`${avgPct}% de desempenho`, FL + 4, y + 28);
        sf(doc, [60, 100, 180] as [number,number,number]); doc.roundedRect(FL + 4, y + 33, topCardW - 8, 2.5, 1, 1, 'F');
        if (avgPct > 0) { sf(doc, WHITE); doc.roundedRect(FL + 4, y + 33, (topCardW - 8) * avgPct / 100, 2.5, 1, 1, 'F'); }

        // Card verde: Areas Fortes
        const mc1X = FL + topCardW + 2;
        sf(doc, WHITE); sdd(doc, PF_SL200); doc.setLineWidth(0.25);
        doc.roundedRect(mc1X, y, topCardW, topCardH, 2, 2, 'FD');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); sc(doc, PF_GREEN_TXT);
        doc.text('Áreas Fortes', mc1X + 4, y + 8);
        pf_chipList(doc, strong.slice(0, 4), mc1X + 4, y + 13, topCardW - 8, 'green');

        // Card laranja: Areas Prioritarias
        const mc2X = FL + 2 * topCardW + 4, mc2W = maxW - 2 * topCardW - 4;
        sf(doc, WHITE); sdd(doc, PF_SL200); doc.setLineWidth(0.25);
        doc.roundedRect(mc2X, y, mc2W, topCardH, 2, 2, 'FD');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); sc(doc, PF_ORANGE_TXT);
        doc.text('Áreas Prioritárias', mc2X + 4, y + 8);
        pf_chipList(doc, priority.slice(0, 4), mc2X + 4, y + 13, mc2W - 8, 'orange');
        y += topCardH + 4;

        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); sc(doc, PF_SL500);
        doc.text(`Data: ${evDate2}  ·  Profissional: ${ev.author || '—'}`, FL, y);
        y += 6;

        // Barras de dimensao (2 colunas)
        const halfW2 = (maxW - 6) / 2, barLineH = 8;
        const barsCardH = Math.ceil(CRITERIA_NAMES.length / 2) * barLineH + 14;
        if (y > pBottom - barsCardH - 10) { doc.addPage(); y = pfHeader(); }
        sf(doc, WHITE); sdd(doc, PF_SL200); doc.setLineWidth(0.25);
        doc.roundedRect(FL, y, maxW, barsCardH, 2, 2, 'FD');
        CRITERIA_NAMES.forEach((name, i) => {
          const score   = scores[i] ?? 0;
          const cx      = FL + 4 + (i % 2) * (halfW2 + 6);
          const cy      = y + 6 + Math.floor(i / 2) * barLineH;
          const barW    = halfW2 - 22;
          const sColor: [number,number,number] = score >= 4 ? PF_GREEN_TXT : score >= 3 ? BRAND as [number,number,number] : score >= 2 ? [217, 119, 6] : [220, 38, 38];
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8); sc(doc, PF_SL700);
          doc.text((doc.splitTextToSize(name, halfW2 - 24) as string[])[0] || name, cx, cy + 4.5);
          doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); sc(doc, sColor);
          doc.text(`${score}/5`, cx + halfW2 - 14, cy + 4.5);
          pf_progressBar(doc, (score / 5) * 100, cx, cy + 5.5, barW, sColor);
        });
        y += barsCardH + 5;

        // Parecer Descritivo
        if (ev.observation?.trim()) {
          if (y > pBottom - 28) { doc.addPage(); y = pfHeader(); }
          y = pf_sectionTitle(doc, 'VII', 'Parecer Descritivo', FL, y);
          doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
          let remaining = [...(doc.splitTextToSize(ev.observation.trim(), maxW - 12) as string[])];
          while (remaining.length > 0) {
            const chunk  = remaining.splice(0, Math.max(1, Math.floor((pBottom - y - 12) / 4.5)));
            const chunkH = chunk.length * 4.5 + 12;
            sf(doc, WHITE); sdd(doc, PF_SL200); doc.setLineWidth(0.25);
            doc.roundedRect(FL, y, maxW, chunkH, 2, 2, 'FD');
            sc(doc, PF_SL700); doc.text(chunk, FL + 6, y + 8);
            y += chunkH + 4;
            if (remaining.length > 0) { doc.addPage(); y = pfHeader(); }
          }
        }
      }

      // Secao VIII: Agendamentos
      if (cfg.agendamentos && extra.appointments && extra.appointments.length > 0) {
        if (y > pBottom - 42) { doc.addPage(); y = pfHeader(); }
        y = pf_sectionTitle(doc, 'VIII', 'Agendamentos', FL, y);
        const aCols = [22, 16, 48, 26, 36, 0];
        aCols[5] = maxW - aCols.slice(0, 5).reduce((s, v) => s + v, 0);
        sf(doc, PF_SL100); doc.rect(FL, y, maxW, 7, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); sc(doc, BRAND as [number,number,number]);
        let cx2 = FL + 2;
        ['DATA', 'HORA', 'TÍTULO', 'TIPO', 'PROFISSIONAL', 'STATUS'].forEach((h, i) => { doc.text(h, cx2, y + 5); cx2 += aCols[i]; });
        y += 8;
        for (const a of extra.appointments) {
          if (y > pBottom - 10) { doc.addPage(); y = pfHeader(); }
          const ds   = a.date ? new Date(a.date + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
          const stC: Record<string, [number,number,number]> = { realizado: PF_GREEN_TXT, cancelado: [220, 38, 38], falta: [217, 119, 6] };
          doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); sc(doc, PF_SL700);
          cx2 = FL + 2;
          [ds, a.time || '—', (a.title || '').substring(0, 26), (a.type || '—').substring(0, 14), (a.professional || '—').substring(0, 18)].forEach((val, i) => {
            doc.text(val, cx2, y + 4); cx2 += aCols[i];
          });
          doc.setFont('helvetica', 'bold'); sc(doc, stC[a.status] || (BRAND as [number,number,number]));
          doc.text((a.status || 'agendado').toUpperCase(), cx2, y + 4);
          sdd(doc, PF_SL200); doc.setLineWidth(0.2); doc.line(FL, y + 6.5, FL + maxW, y + 6.5);
          y += 7.5;
        }
        y += 4;
      }

      // Secao IX: Controle de Atendimento
      if (cfg.controleAtendimento && extra.serviceRecords && extra.serviceRecords.length > 0) {
        if (y > pBottom - 42) { doc.addPage(); y = pfHeader(); }
        y = pf_sectionTitle(doc, 'IX', 'Controle de Atendimento', FL, y);
        const total    = extra.serviceRecords.length;
        const presente = extra.serviceRecords.filter((r: any) => r.attendance === 'Presente').length;
        const taxa     = total > 0 ? Math.round((presente / total) * 100) : 0;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); sc(doc, PF_SL500);
        doc.text(`${total} atendimento(s)  ·  Presença: ${taxa}%`, FL, y);
        pf_progressBar(doc, taxa, FL + 80, y - 3.5, 60, PF_GREEN_TXT);
        y += 8;
        const sCols = [24, 16, 30, 36, 22, 0];
        sCols[5] = maxW - sCols.slice(0, 5).reduce((s, v) => s + v, 0);
        sf(doc, PF_SL100); doc.rect(FL, y, maxW, 7, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); sc(doc, BRAND as [number,number,number]);
        let sx = FL + 2;
        ['DATA', 'HORA', 'TIPO', 'PROFISSIONAL', 'PRESENÇA', 'OBSERVAÇÕES'].forEach((h, i) => { doc.text(h, sx, y + 5); sx += sCols[i]; });
        y += 8;
        for (const r of extra.serviceRecords.slice(0, 30)) {
          if (y > pBottom - 10) { doc.addPage(); y = pfHeader(); }
          const ds = r.date ? new Date(r.date).toLocaleDateString('pt-BR') : '—';
          const pColor: [number,number,number] = r.attendance === 'Presente' ? PF_GREEN_TXT : r.attendance === 'Falta' ? [220, 38, 38] : PF_SL500;
          doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); sc(doc, PF_SL700);
          sx = FL + 2;
          [ds, r.time || '—', (r.type || '—').substring(0, 16), (r.professional || '—').substring(0, 20)].forEach((val, i) => { doc.text(val, sx, y + 4); sx += sCols[i]; });
          doc.setFont('helvetica', 'bold'); sc(doc, pColor);
          doc.text(r.attendance || '—', sx, y + 4); sx += sCols[4];
          doc.setFont('helvetica', 'normal'); sc(doc, PF_SL400);
          doc.text((r.observations || '').substring(0, 28), sx, y + 4);
          sdd(doc, PF_SL200); doc.setLineWidth(0.2); doc.line(FL, y + 6.5, FL + maxW, y + 6.5);
          y += 7.5;
        }
        if (extra.serviceRecords.length > 30) {
          doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5); sc(doc, PF_SL400);
          doc.text(`e mais ${extra.serviceRecords.length - 30} registros`, FL, y + 3);
          y += 6;
        }
        y += 4;
      }

      // Secao X: Documentos, Laudos e Fichas
      const hasDocs =
        (cfg.documentosGerados    && extra.protocols && extra.protocols.length > 0) ||
        (cfg.analiseLaudo         && extra.documents && extra.documents.some((d: any) => d.type === 'Laudo' || d.type === 'Relatorio')) ||
        (cfg.fichasComplementares && extra.obsForms  && extra.obsForms.length  > 0);
      if (hasDocs) {
        if (y > pBottom - 44) { doc.addPage(); y = pfHeader(); }
        y = pf_sectionTitle(doc, 'X', 'Documentos, Laudos e Fichas Complementares', FL, y);
        const docCardW = (maxW - 6) / 3;
        const docItems = (extra.protocols || []).slice(0, 6);
        const laudos   = (extra.documents || []).filter((d: any) => d.type === 'Laudo' || d.type === 'Relatorio').slice(0, 6);
        const fichas   = (extra.obsForms  || []).slice(0, 6);
        const cardH3   = Math.max(40, 14 + Math.max(docItems.length, laudos.length, fichas.length) * 10 + 4);
        const renderListCard = (cx: number, title: string, items: any[], labelFn: (item: any) => string, dateFn: (item: any) => string) => {
          sf(doc, WHITE); sdd(doc, PF_SL200); doc.setLineWidth(0.25);
          doc.roundedRect(cx, y, docCardW, cardH3, 2, 2, 'FD');
          doc.setFont('helvetica', 'bold'); doc.setFontSize(9); sc(doc, PF_SL900);
          doc.text(title, cx + 4, y + 8);
          if (!items.length) {
            doc.setFont('helvetica', 'italic'); doc.setFontSize(8); sc(doc, PF_SL400);
            doc.text('Nenhum registro', cx + 4, y + 16);
          } else {
            items.forEach((item, idx) => {
              const iy = y + 14 + idx * 10;
              doc.setFont('helvetica', 'bold'); doc.setFontSize(8); sc(doc, PF_SL700);
              doc.text((doc.splitTextToSize(labelFn(item), docCardW - 8) as string[])[0], cx + 4, iy);
              doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); sc(doc, PF_SL400);
              doc.text(dateFn(item), cx + 4, iy + 5);
            });
          }
        };
        renderListCard(FL,                    'Documentos Gerados',  docItems,
          (p: any) => p.title || p.doc_type || 'Documento',
          (p: any) => `${p.createdAt ? new Date(p.createdAt).toLocaleDateString('pt-BR') : '—'} · ${p.status === 'FINAL' ? 'Concluído' : 'Rascunho'}`);
        renderListCard(FL + docCardW + 3,     'Laudos e Documentos', laudos,
          (d: any) => d.name || 'Documento clínico',
          (d: any) => `${d.date || '—'} · Tipo: ${d.type}`);
        renderListCard(FL + 2*(docCardW + 3), 'Fichas Complementares', fichas,
          (f: any) => f.title || f.ficha_type || 'Ficha de Observação',
          (f: any) => f.created_at ? new Date(f.created_at).toLocaleDateString('pt-BR') : '—');
        y += cardH3 + 5;
      }
    }

    // ==============================================================
    // ASSINATURAS E VALIDACAO INSTITUCIONAL (sempre ao final)
    // ==============================================================
    if (y > pBottom - 52) { doc.addPage(); y = pfHeader(); }
    y += 4;
    y = pf_sectionTitle(doc, 'XI', 'Assinaturas e Validação Institucional', FL, y);
    doc.setFont('helvetica', 'italic'); doc.setFontSize(9); sc(doc, PF_SL500);
    const decl = 'Declaramos ciência e concordância com as informações pedagógicas registradas nesta ficha, comprometendo-nos a utilizá-las exclusivamente para fins educacionais e de suporte ao aluno.';
    const declLines = doc.splitTextToSize(decl, maxW) as string[];
    doc.text(declLines, FL, y);
    y += declLines.length * 4.5 + 14;

    ['Professor(a) Regente', 'Professor(a) AEE', 'Coordenação Pedagógica', 'Responsável Legal'].forEach((sig, i) => {
      const sx = FL + i * (maxW / 4);
      sdd(doc, PF_SL400); doc.setLineWidth(0.3);
      doc.line(sx, y + 12, sx + maxW / 4 - 4, y + 12);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); sc(doc, PF_SL500);
      doc.text(sig, sx + (maxW / 4 - 4) / 2, y + 17, { align: 'center' });
    });
    y += 26;

    sf(doc, PF_SL100); sdd(doc, PF_SL200); doc.setLineWidth(0.2);
    doc.roundedRect(FL, y, maxW, 14, 2, 2, 'FD');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); sc(doc, PF_SL500);
    doc.text(`Código do documento: ${internalCode}  ·  Emitido em: ${new Date().toLocaleDateString('pt-BR')}`, FL + 4, y + 5);
    doc.setFontSize(7);
    doc.text('Documento pedagógico para uso interno. Não contém link de validação pública.', FL + 4, y + 10);

    // Rodape em todas as paginas
    pf_footerAllPages(doc, internalCode, emittedBy);
    doc.save(`Ficha_${student.name.replace(/\s+/g, '_')}.pdf`);"""

with open(FILE, 'r', encoding='utf-8') as f:
    content = f.read()

# Find the start: the marker comment line
START = '    // ─── INÍCIO DO NOVO CORPO (premium visual) ──────────────────────────────\n'
# Find the end: the doc.save line
END_NEEDLE = "    doc.save(`Ficha_${student.name.replace(/\\s+/g, '_')}.pdf`);"

start_idx = content.find(START)
end_idx   = content.find(END_NEEDLE)

if start_idx == -1:
    print('ERROR: start marker not found')
    exit(1)
if end_idx == -1:
    print('ERROR: end marker not found')
    exit(1)

end_idx += len(END_NEEDLE)

# Verify
snippet_start = content[start_idx:start_idx+80].replace('\n', '\\n')
snippet_end   = content[end_idx-80:end_idx].replace('\n', '\\n')
import sys
sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)
print(f'Replacing chars {start_idx}..{end_idx} ({end_idx-start_idx} chars)')
print(f'  start: {snippet_start!r}')
print(f'  end:   {snippet_end!r}')

new_content = content[:start_idx] + '\n' + NEW_BODY + content[end_idx:]

with open(FILE, 'w', encoding='utf-8') as f:
    f.write(new_content)

print('DONE - file written successfully')
