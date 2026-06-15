import { chromium } from './node_modules/playwright/index.mjs';

const BASE = 'http://localhost:5190';
const results = [];

function log(item, status, detail = '') {
  results.push({ item, status });
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

// ── MOBILE 390×844 ────────────────────────────────────────────────────────
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();

const consoleErrors = [];
page.on('console', m => {
  if (m.type() === 'error' && !m.text().includes('credits_ledger') && !m.text().includes('SubscriptionView')) {
    consoleErrors.push(m.text().slice(0, 150));
  }
});

await doLogin(page);
await page.waitForTimeout(1000);

// Topbar 64px
const topbarH = await page.evaluate(() => document.querySelector('header')?.getBoundingClientRect().height ?? 0);
log('Mobile (390px) — topbar altura 64px', topbarH === 64 ? 'OK' : 'WARN', `${topbarH}px`);

// Frase motivacional oculta em mobile
const phraseDiv = await page.evaluate(() => {
  const divs = [...document.querySelectorAll('header > div')];
  const phraseD = divs.find(d => d.classList.contains('hidden'));
  if (!phraseD) return 'not found';
  return window.getComputedStyle(phraseD).display;
});
log('Mobile — frase oculta (display:none)', phraseDiv === 'none' ? 'OK' : 'WARN', `display: ${phraseDiv}`);

// Screenshot 1: dashboard mobile (sidebar fechada)
await page.screenshot({ path: 'val_mobile_dashboard.png', fullPage: false });
log('Screenshot mobile — dashboard (sidebar fechada)', 'OK');

// Verificar sidebar fechada (translate-x -256)
const sidebarTransform = await page.evaluate(() => {
  const a = document.querySelector('aside');
  return a ? window.getComputedStyle(a).transform : 'not found';
});
const isClosed = sidebarTransform.includes('-256') || sidebarTransform.includes('matrix(1, 0, 0, 1, -');
log('Mobile — sidebar fechada inicialmente', isClosed ? 'OK' : 'WARN', sidebarTransform.slice(0, 50));

// Abrir sidebar (hamburger)
const hamburger = page.locator('header button').first();
await hamburger.click({ force: true });
await page.waitForTimeout(600);

const sidebarOpen = await page.evaluate(() => {
  const a = document.querySelector('aside');
  return a ? window.getComputedStyle(a).transform : 'not found';
});
const isOpen = !sidebarOpen.includes('-256') && !sidebarOpen.includes('matrix(1, 0, 0, 1, -');
log('Mobile — sidebar abre com hamburger', isOpen ? 'OK' : 'WARN', sidebarOpen.slice(0, 50));

// Screenshot 2: sidebar aberta
await page.screenshot({ path: 'val_mobile_sidebar.png', fullPage: false });
log('Screenshot mobile — sidebar aberta', 'OK');

// Verificar botão sair visível com sidebar aberta
const sairVisible = await page.evaluate(() => {
  const sair = [...document.querySelectorAll('aside button')].find(b => b.textContent?.includes('Sair'));
  if (!sair) return { visible: false, top: -1 };
  const r = sair.getBoundingClientRect();
  return { visible: r.top > 0 && r.top < window.innerHeight, top: r.top };
});
log('Mobile — botão "Sair" visível com sidebar aberta', sairVisible.visible ? 'OK' : 'WARN', `top: ${sairVisible.top}px`);

// Fechar sidebar pelo overlay
const overlay = page.locator('.bg-black\\/50').first();
await overlay.click({ force: true }).catch(async () => {
  // fallback: click fora da sidebar
  await page.mouse.click(380, 400);
});
await page.waitForTimeout(600);

const sidebarAfterClose = await page.evaluate(() => {
  const a = document.querySelector('aside');
  return a ? window.getComputedStyle(a).transform : '';
});
const closedAfter = sidebarAfterClose.includes('-256') || sidebarAfterClose.includes('matrix(1, 0, 0, 1, -');
log('Mobile — sidebar fecha pelo overlay', closedAfter ? 'OK' : 'WARN', sidebarAfterClose.slice(0, 50));

// Sugestão do dia legível em mobile
const suggOk = await page.evaluate(() => document.body.innerText.includes('Sugestão do dia'));
log('Mobile — "Sugestão do dia" presente', suggOk ? 'OK' : 'WARN');

// Textos não estouram
const overflowNodes = await page.evaluate(() => {
  const nodes = [...document.querySelectorAll('main *')];
  const overflowing = nodes.filter(n => {
    try {
      return n.scrollWidth > n.clientWidth + 2 && window.getComputedStyle(n).overflow !== 'hidden';
    } catch { return false; }
  });
  return overflowing.length;
});
log('Mobile — textos sem overflow horizontal', overflowNodes < 5 ? 'OK' : 'WARN', `${overflowNodes} nós com possível overflow`);

// Screenshot 3: mobile após fechar sidebar
await page.screenshot({ path: 'val_mobile_after_close.png', fullPage: false });
log('Screenshot mobile — após fechar sidebar', 'OK');

await browser.close();

// ── RESULTADO ─────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════');
const ok = results.filter(r => r.status === 'OK').length;
const warn = results.filter(r => r.status === 'WARN').length;
const fail = results.filter(r => r.status === 'FAIL').length;
console.log(`Mobile: ✅ ${ok} OK | ⚠️ ${warn} WARN | ❌ ${fail} FAIL`);
if (consoleErrors.length > 0) {
  console.log('Erros de console mobile:');
  consoleErrors.forEach(e => console.log(' •', e));
} else {
  console.log('Sem erros de console críticos em mobile.');
}
