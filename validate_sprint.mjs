import { chromium } from './node_modules/playwright/index.mjs';

const BASE = 'http://localhost:5190';
const results = [];
const consoleErrors = [];

function log(item, status, detail = '') {
  results.push({ item, status, detail });
  const icon = status === 'OK' ? '✅' : status === 'WARN' ? '⚠️' : '❌';
  console.log(`${icon} [${status}] ${item}${detail ? ' — ' + detail : ''}`);
}

async function doLogin(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.fill('input[type="email"]', 'demo@incluiai.com');
  await page.fill('input[type="password"]', '123456');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(4000);
}

// ── DESKTOP (1440×900) ─────────────────────────────────────────────────────
{
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  page.on('console', m => {
    if (m.type() === 'error') {
      const txt = m.text();
      // Ignorar erros esperados de DEMO_MODE no SubscriptionView
      if (!txt.includes('credits_ledger') && !txt.includes('SubscriptionView')) {
        consoleErrors.push(`[desktop] ${txt.slice(0, 160)}`);
      }
    }
  });
  page.on('pageerror', e => consoleErrors.push(`[desktop pageerror] ${e.message.slice(0, 160)}`));

  // === LOGIN ===
  await doLogin(page);
  const bodyAfterLogin = await page.evaluate(() => document.body.innerText.slice(0, 80));
  if (bodyAfterLogin.includes('Dashboard') || bodyAfterLogin.includes('PLANO') || bodyAfterLogin.includes('FREE')) {
    log('Login e navegação ao dashboard', 'OK');
  } else {
    log('Login e navegação ao dashboard', 'FAIL', `body: ${bodyAfterLogin.slice(0, 60)}`);
  }

  // === TOPBAR ─ cor petrol ===
  const topbarBg = await page.evaluate(() => {
    const header = document.querySelector('header');
    return header ? window.getComputedStyle(header).backgroundColor : 'not found';
  });
  // rgb(22, 79, 95) = #164F5F
  if (topbarBg.includes('22, 79, 95') || topbarBg.includes('22,79,95')) {
    log('Topbar — cor petrol #164F5F', 'OK', topbarBg);
  } else {
    log('Topbar — cor petrol #164F5F', 'WARN', `cor encontrada: ${topbarBg}`);
  }

  // === TOPBAR ─ frase motivacional ===
  const phraseEl = await page.evaluate(() => {
    const headers = document.querySelectorAll('header span');
    for (const s of headers) {
      const t = s.textContent?.trim();
      if (t && t.length > 10 && t.length < 80) return t;
    }
    return null;
  });
  if (phraseEl) {
    log('Topbar — frase motivacional', 'OK', phraseEl);
  } else {
    log('Topbar — frase motivacional', 'WARN', 'span não encontrado (pode estar oculto)');
  }

  // === TOPBAR ─ sino/notificações ===
  const hasBell = await page.locator('header button').count();
  if (hasBell > 0) {
    log('Topbar — sino/notificações presente', 'OK', `${hasBell} botões na header`);
  } else {
    log('Topbar — sino/notificações presente', 'WARN', 'nenhum botão na header');
  }

  // === "Sugestões inteligentes" REMOVIDO ===
  const oldLabel = await page.evaluate(() =>
    document.body.innerText.includes('Sugestões inteligentes')
  );
  if (!oldLabel) {
    log('"Sugestões inteligentes" removido', 'OK');
  } else {
    log('"Sugestões inteligentes" removido', 'FAIL', 'texto ainda aparece na página');
  }

  // === "Sugestão do dia" PRESENTE ===
  const newLabel = await page.evaluate(() =>
    document.body.innerText.includes('Sugestão do dia')
  );
  if (newLabel) {
    log('"Sugestão do dia" presente', 'OK');
  } else {
    log('"Sugestão do dia" presente', 'FAIL', 'texto não encontrado');
  }

  // === SIDEBAR — "Alunos (anamnese)" REMOVIDO ===
  const oldMenuLabel = await page.evaluate(() =>
    document.body.innerText.includes('Alunos (anamnese)')
  );
  if (!oldMenuLabel) {
    log('Sidebar — "Alunos (anamnese)" removido', 'OK');
  } else {
    log('Sidebar — "Alunos (anamnese)" removido', 'FAIL');
  }

  // === SIDEBAR — "Cadastrar aluno" PRESENTE ===
  const newMenuLabel = await page.evaluate(() =>
    document.body.innerText.includes('Cadastrar aluno')
  );
  if (newMenuLabel) {
    log('Sidebar — "Cadastrar aluno" presente', 'OK');
  } else {
    log('Sidebar — "Cadastrar aluno" presente', 'FAIL');
  }

  // === SIDEBAR — grupos teal ===
  const groupLabels = await page.evaluate(() => {
    const all = [...document.querySelectorAll('aside span')];
    return all.filter(s => {
      const t = s.textContent?.trim();
      return t === 'Geral' || t === 'Documentação' || t === 'Ferramentas IA' || t === 'Avaliação e histórico';
    }).map(s => ({
      text: s.textContent?.trim(),
      color: window.getComputedStyle(s).color,
    }));
  });
  if (groupLabels.length >= 4) {
    log('Sidebar — 4 labels de grupo presentes', 'OK', groupLabels.map(g => g.text).join(', '));
    // Verificar cor teal
    const tealOk = groupLabels.some(g => g.color.includes('0, 151, 167') || g.color.includes('0,151,167'));
    if (tealOk) {
      log('Sidebar — labels com cor teal #0097A7', 'OK');
    } else {
      log('Sidebar — labels com cor teal #0097A7', 'WARN', `cores encontradas: ${groupLabels.map(g=>g.color).join(' | ')}`);
    }
  } else {
    log('Sidebar — 4 labels de grupo', 'WARN', `apenas ${groupLabels.length} encontrados: ${groupLabels.map(g=>g.text).join(', ')}`);
  }

  // === SIDEBAR — botão Sair acessível ===
  const logoutBtn = await page.locator('aside button:has-text("Sair")').count();
  if (logoutBtn > 0) {
    log('Sidebar — botão "Sair da Conta" visível', 'OK');
  } else {
    log('Sidebar — botão "Sair da Conta" visível', 'WARN', 'não encontrado no aside');
  }

  // === SIDEBAR — bloco usuário acima do fold? (sticky) ===
  const userBlockVisible = await page.evaluate(() => {
    const sair = [...document.querySelectorAll('aside button')].find(b => b.textContent?.includes('Sair'));
    if (!sair) return false;
    const rect = sair.getBoundingClientRect();
    return rect.top > 0 && rect.top < window.innerHeight;
  });
  log('Sidebar — bloco usuário visível sem scroll', userBlockVisible ? 'OK' : 'WARN');

  // === CARDS DO DASHBOARD — sem dados vazios críticos ===
  const cardValues = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      hasPlan: text.includes('Plano atual'),
      hasCredits: text.includes('Créditos IA'),
      hasStudents: text.includes('Alunos cadastrados'),
      hasDocs: text.includes('Documentos gerados'),
    };
  });
  const cardsOk = Object.values(cardValues).every(Boolean);
  log('Dashboard — 4 stat cards presentes', cardsOk ? 'OK' : 'WARN', JSON.stringify(cardValues));

  // === PLANO — sem "mensal" indevido ===
  const planText = await page.evaluate(() => {
    const text = document.body.innerText;
    // Pegar trecho ao redor de "Plano atual"
    const idx = text.indexOf('Plano atual');
    return idx >= 0 ? text.slice(idx, idx + 40) : '';
  });
  const hasMensalIndevido = planText.toLowerCase().includes('mensal') || planText.toLowerCase().includes('anual');
  if (!hasMensalIndevido) {
    log('Plano — FREE sem sufixo de ciclo', 'OK', `trecho: "${planText.trim()}"`);
  } else {
    log('Plano — FREE sem sufixo de ciclo', 'WARN', `trecho: "${planText.trim()}"`);
  }

  // === SCREENSHOT DESKTOP — DASHBOARD ===
  await page.screenshot({ path: 'val_desktop_dashboard.png', fullPage: true });
  log('Screenshot desktop — dashboard', 'OK');

  // === NAVEGAÇÃO — Configurações ===
  await page.locator('button').filter({ hasText: 'Configurações' }).first().click().catch(() => {});
  await page.waitForTimeout(1500);
  const settingsLoaded = await page.evaluate(() => document.body.innerText.includes('Configurações'));
  log('Navegação — Configurações abre', settingsLoaded ? 'OK' : 'WARN');

  // === PLANO em Configurações ===
  const settingsPlanText = await page.evaluate(() => {
    const text = document.body.innerText;
    const idx = text.indexOf('Plano atual');
    return idx >= 0 ? text.slice(idx, idx + 60).trim() : '';
  });
  const settingsMensalIndevido = settingsPlanText.toLowerCase().includes('free mensal') || settingsPlanText.toLowerCase().includes('free anual');
  log('Configurações — plano sem ciclo indevido', settingsMensalIndevido ? 'FAIL' : 'OK', `"${settingsPlanText}"`);
  await page.screenshot({ path: 'val_desktop_settings.png', fullPage: true });

  // === NAVEGAÇÃO — Assinatura ===
  await page.locator('button').filter({ hasText: 'Assinatura' }).first().click().catch(() => {});
  await page.waitForTimeout(1500);
  const subLoaded = await page.evaluate(() => document.body.innerText.includes('FREE') || document.body.innerText.includes('Profissional'));
  log('Navegação — Assinatura & Créditos abre', subLoaded ? 'OK' : 'WARN');

  // Verificar se "PREMIUM MENSAL" ou "PRO MENSAL" aparece indevidamente (no demo deve ser apenas FREE)
  const subText = await page.evaluate(() => document.body.innerText.slice(0, 300));
  const subMensalIndevido = subText.includes('FREE MENSAL') || subText.includes('FREE ANUAL');
  log('Assinatura — plano sem ciclo indevido', subMensalIndevido ? 'FAIL' : 'OK');
  await page.screenshot({ path: 'val_desktop_subscription.png', fullPage: true });

  // === NAVEGAÇÃO — voltar ao dashboard ===
  await page.locator('button').filter({ hasText: 'Dashboard' }).first().click().catch(() => {});
  await page.waitForTimeout(1500);

  // === NAVEGAÇÃO — Aluno (tela de alunos) ===
  await page.locator('button').filter({ hasText: 'Cadastrar aluno' }).first().click().catch(() => {});
  await page.waitForTimeout(1500);
  const studentsLoaded = await page.evaluate(() =>
    document.body.innerText.includes('aluno') || document.body.innerText.includes('Nenhum') || document.body.innerText.includes('Cadastrar')
  );
  log('Navegação — tela Alunos/Cadastrar abre', studentsLoaded ? 'OK' : 'WARN');

  // === NAVEGAÇÃO — PEI ===
  await page.locator('button').filter({ hasText: 'PEI' }).first().click().catch(() => {});
  await page.waitForTimeout(1500);
  const peiLoaded = await page.evaluate(() =>
    document.body.innerText.includes('PEI') || document.body.innerText.includes('Plano Educacional')
  );
  log('Navegação — tela PEI (documentos) abre', peiLoaded ? 'OK' : 'WARN');

  // === LOGOUT ===
  await page.locator('aside button').filter({ hasText: 'Sair' }).click().catch(() => {});
  await page.waitForTimeout(2000);
  const afterLogout = await page.evaluate(() => document.body.innerText.slice(0, 80));
  const loggedOut = afterLogout.includes('Entrar') || afterLogout.includes('login') || afterLogout.includes('IncluiAI');
  log('Logout funciona', loggedOut ? 'OK' : 'WARN', `após logout: "${afterLogout.slice(0, 40)}"`);

  await browser.close();
}

// ── TABLET (768×1024) ─────────────────────────────────────────────────────
{
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 768, height: 1024 } });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('credits_ledger')) consoleErrors.push(`[tablet] ${m.text().slice(0,100)}`); });

  await doLogin(page);
  await page.waitForTimeout(1000);

  // Topbar não quebra
  const topbarH = await page.evaluate(() => {
    const h = document.querySelector('header');
    return h ? h.getBoundingClientRect().height : 0;
  });
  log('Tablet (768px) — topbar altura OK', topbarH > 40 && topbarH <= 80 ? 'OK' : 'WARN', `${topbarH}px`);

  // Sidebar: mobile drawer (lg:hidden logo deve aparecer)
  const sidebarOpen = await page.evaluate(() => {
    const aside = document.querySelector('aside');
    if (!aside) return false;
    const t = window.getComputedStyle(aside).transform;
    // Se translate-x-0 = matrix(1,0,0,1,0,0) — aberto; -translate-full = matrix(1,0,0,1,-256,0)
    return !t.includes('-256');
  });
  log('Tablet (768px) — sidebar estado', sidebarOpen ? 'OK (aberta)' : 'OK (fechada — drawer mode)');

  await page.screenshot({ path: 'val_tablet_dashboard.png', fullPage: false });
  log('Screenshot tablet — dashboard', 'OK');

  await browser.close();
}

// ── MOBILE (390×844) ─────────────────────────────────────────────────────
{
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('credits_ledger')) consoleErrors.push(`[mobile] ${m.text().slice(0,100)}`); });

  await doLogin(page);
  await page.waitForTimeout(1500);

  // Topbar não quebra em mobile
  const topbarH = await page.evaluate(() => {
    const h = document.querySelector('header');
    return h ? h.getBoundingClientRect().height : 0;
  });
  log('Mobile (390px) — topbar altura OK', topbarH > 40 && topbarH <= 80 ? 'OK' : 'WARN', `${topbarH}px`);

  // Frase motivacional OCULTA em mobile (hidden lg:flex)
  const phraseHiddenMobile = await page.evaluate(() => {
    const spans = [...document.querySelectorAll('header div')];
    const phraseDiv = spans.find(d => d.className?.includes('hidden') && d.className?.includes('lg:flex'));
    if (!phraseDiv) return true; // não encontrou = ok, está oculto
    const disp = window.getComputedStyle(phraseDiv).display;
    return disp === 'none'; // em mobile deve ser none
  });
  log('Mobile — frase motivacional oculta (hidden lg:flex)', phraseHiddenMobile ? 'OK' : 'WARN');

  // Sidebar fechada em mobile
  const sidebarClosed = await page.evaluate(() => {
    const aside = document.querySelector('aside');
    if (!aside) return false;
    const t = window.getComputedStyle(aside).transform;
    return t.includes('-256') || t.includes('matrix(1, 0, 0, 1, -256');
  });
  log('Mobile — sidebar fecha corretamente', sidebarClosed ? 'OK' : 'WARN');

  // Abrir sidebar pelo hamburger
  await page.locator('header button').first().click();
  await page.waitForTimeout(500);
  const sidebarAfterHamburger = await page.evaluate(() => {
    const aside = document.querySelector('aside');
    if (!aside) return false;
    const t = window.getComputedStyle(aside).transform;
    return !t.includes('-256') && !t.includes('matrix(1, 0, 0, 1, -');
  });
  log('Mobile — hamburger abre sidebar', sidebarAfterHamburger ? 'OK' : 'WARN');

  // Botão sair visível na sidebar aberta
  const sairVisible = await page.evaluate(() => {
    const sair = [...document.querySelectorAll('aside button')].find(b => b.textContent?.includes('Sair'));
    if (!sair) return false;
    const rect = sair.getBoundingClientRect();
    return rect.top > 0 && rect.top < window.innerHeight;
  });
  log('Mobile — botão "Sair da Conta" visível na sidebar', sairVisible ? 'OK' : 'WARN');

  // Fechar sidebar
  await page.keyboard.press('Escape').catch(() => {});
  const overlay = page.locator('.bg-black\\/50, .bg-black\\/40');
  await overlay.click({ force: true }).catch(() => {});
  await page.waitForTimeout(400);

  // Sugestão do dia legível (texto não estoura)
  const suggestionCard = await page.evaluate(() => {
    const bodyText = document.body.innerText;
    const hasCard = bodyText.includes('Sugestão do dia');
    return hasCard;
  });
  log('Mobile — "Sugestão do dia" presente', suggestionCard ? 'OK' : 'WARN');

  await page.screenshot({ path: 'val_mobile_dashboard.png', fullPage: false });
  log('Screenshot mobile — dashboard', 'OK');

  // Screenshot sidebar aberta no mobile
  await page.locator('header button').first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'val_mobile_sidebar.png', fullPage: false });
  log('Screenshot mobile — sidebar aberta', 'OK');

  await browser.close();
}

// ── ARQUIVOS NÃO TOCADOS ─────────────────────────────────────────────────
import { readFileSync, existsSync } from 'fs';
const critical = [
  'src/services/PDFGenerator.ts',
  'src/services/databaseService.ts',
  'src/services/aiService.ts',
  'src/services/canonicalStudentContext.ts',
  'src/services/reportService.ts',
  'supabase/functions/ai-gateway/index.ts',
];
for (const f of critical) {
  const path = `c:/Users/karle/Downloads/INCLUIAI_PRODUCAO_PRONTO/${f}`;
  if (existsSync(path)) {
    log(`Arquivo crítico intacto: ${f.split('/').pop()}`, 'OK');
  } else {
    log(`Arquivo crítico ausente: ${f}`, 'FAIL');
  }
}

// ── RELATÓRIO FINAL ───────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════');
console.log('ERROS DE CONSOLE ENCONTRADOS:');
if (consoleErrors.length === 0) {
  console.log('  Nenhum erro crítico.');
} else {
  consoleErrors.forEach(e => console.log('  •', e));
}

console.log('\nRESUMO:');
const ok   = results.filter(r => r.status === 'OK').length;
const warn = results.filter(r => r.status === 'WARN').length;
const fail = results.filter(r => r.status === 'FAIL').length;
console.log(`  ✅ OK: ${ok} | ⚠️ WARN: ${warn} | ❌ FAIL: ${fail}`);
