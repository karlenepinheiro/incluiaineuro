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

const consoleErrors = [];

// ── MOBILE 390×844 ────────────────────────────────────────────────────────
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();

page.on('console', m => {
  if (m.type() === 'error' && !m.text().includes('credits_ledger') && !m.text().includes('SubscriptionView')) {
    consoleErrors.push(m.text().slice(0, 150));
  }
});

await doLogin(page);
await page.waitForTimeout(1000);

// 1. Sidebar FECHADA ao carregar em mobile
const sidebarTransform = await page.evaluate(() => {
  const a = document.querySelector('aside');
  return a ? window.getComputedStyle(a).transform : 'not found';
});
const isClosed = sidebarTransform.includes('-256') || sidebarTransform.includes('matrix(1, 0, 0, 1, -');
log('Mobile — sidebar FECHADA ao carregar', isClosed ? 'OK' : 'FAIL', sidebarTransform.slice(0, 60));

// 2. "Sugestão do dia" visível com sidebar fechada
const suggOk = await page.evaluate(() => document.body.innerText.includes('Sugestão do dia'));
log('Mobile — "Sugestão do dia" visível com sidebar fechada', suggOk ? 'OK' : 'WARN');

// Screenshot: dashboard mobile com sidebar fechada
await page.screenshot({ path: 'val_mobile_fix_closed.png', fullPage: false });
log('Screenshot — mobile dashboard sidebar fechada', 'OK');

// 3. Hamburger abre a sidebar
const hamburger = page.locator('header button').first();
await hamburger.click({ force: true });
await page.waitForTimeout(600);

const sidebarOpen = await page.evaluate(() => {
  const a = document.querySelector('aside');
  return a ? window.getComputedStyle(a).transform : 'not found';
});
const isOpen = !sidebarOpen.includes('-256') && !sidebarOpen.includes('matrix(1, 0, 0, 1, -');
log('Mobile — hamburger abre sidebar', isOpen ? 'OK' : 'FAIL', sidebarOpen.slice(0, 50));

// 4. Botão Sair visível dentro da sidebar aberta
const sairVisible = await page.evaluate(() => {
  const sair = [...document.querySelectorAll('aside button')].find(b => b.textContent?.includes('Sair'));
  if (!sair) return { visible: false, top: -1 };
  const r = sair.getBoundingClientRect();
  return { visible: r.top > 0 && r.top < window.innerHeight, top: Math.round(r.top) };
});
log('Mobile — "Sair da Conta" visível na sidebar aberta', sairVisible.visible ? 'OK' : 'WARN', `top: ${sairVisible.top}px`);

// Screenshot: sidebar aberta
await page.screenshot({ path: 'val_mobile_fix_open.png', fullPage: false });
log('Screenshot — mobile sidebar aberta', 'OK');

// 5. Clicar em item do menu fecha a sidebar
const dashBtn = page.locator('aside button').first();
await dashBtn.click({ force: true });
await page.waitForTimeout(600);

const afterNavTransform = await page.evaluate(() => {
  const a = document.querySelector('aside');
  return a ? window.getComputedStyle(a).transform : '';
});
const closedAfterNav = afterNavTransform.includes('-256') || afterNavTransform.includes('matrix(1, 0, 0, 1, -');
log('Mobile — sidebar fecha ao clicar em item do menu', closedAfterNav ? 'OK' : 'FAIL', afterNavTransform.slice(0, 50));

// 6. Reabrir para testar overlay
await hamburger.click({ force: true });
await page.waitForTimeout(600);

const overlay = page.locator('.fixed.inset-0').first();
await overlay.click({ force: true }).catch(async () => {
  await page.mouse.click(370, 400);
});
await page.waitForTimeout(600);

const afterOverlayTransform = await page.evaluate(() => {
  const a = document.querySelector('aside');
  return a ? window.getComputedStyle(a).transform : '';
});
const closedByOverlay = afterOverlayTransform.includes('-256') || afterOverlayTransform.includes('matrix(1, 0, 0, 1, -');
log('Mobile — overlay fecha sidebar', closedByOverlay ? 'OK' : 'WARN', afterOverlayTransform.slice(0, 50));

// 7. Topbar BrandLogo: verificar que tem texto branco (não azul escuro)
const logoColorOk = await page.evaluate(() => {
  const header = document.querySelector('header');
  if (!header) return false;
  const spans = [...header.querySelectorAll('span')];
  // "Inclui" deve ser branco (rgb(255,255,255)) ou rgba com alta opacidade
  const incluiSpan = spans.find(s => s.textContent === 'Inclui');
  if (!incluiSpan) return null;
  const color = window.getComputedStyle(incluiSpan).color;
  return { color, ok: color === 'rgb(255, 255, 255)' || color.includes('255, 255, 255') };
});
const colorStatus = logoColorOk === null ? 'WARN' : (logoColorOk.ok ? 'OK' : 'FAIL');
log('Mobile — BrandLogo "Inclui" texto branco na topbar', colorStatus, JSON.stringify(logoColorOk));

// 8. Topbar altura 64px
const topbarH = await page.evaluate(() => document.querySelector('header')?.getBoundingClientRect().height ?? 0);
log('Mobile — topbar 64px', topbarH === 64 ? 'OK' : 'WARN', `${topbarH}px`);

// 9. Sem overflow horizontal
const overflowNodes = await page.evaluate(() => {
  const nodes = [...document.querySelectorAll('main *')];
  return nodes.filter(n => {
    try { return n.scrollWidth > n.clientWidth + 2 && window.getComputedStyle(n).overflow !== 'hidden'; }
    catch { return false; }
  }).length;
});
log('Mobile — sem overflow horizontal', overflowNodes < 5 ? 'OK' : 'WARN', `${overflowNodes} nós`);

// ── DESKTOP 1440×900 ──────────────────────────────────────────────────────
const ctxD = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const pageD = await ctxD.newPage();
await doLogin(pageD);
await pageD.waitForTimeout(1000);

const sidebarDesktop = await pageD.evaluate(() => {
  const a = document.querySelector('aside');
  return a ? window.getComputedStyle(a).transform : 'not found';
});
const desktopOpen = !sidebarDesktop.includes('-256') && !sidebarDesktop.includes('matrix(1, 0, 0, 1, -');
log('Desktop — sidebar ABERTA ao carregar', desktopOpen ? 'OK' : 'FAIL', sidebarDesktop.slice(0, 50));

const phraseEl = await pageD.evaluate(() => {
  const divs = [...document.querySelectorAll('header div')];
  return divs.some(d => d.classList.contains('hidden') && d.classList.contains('lg:flex'));
});
log('Desktop — frase motivacional presente (hidden lg:flex)', phraseEl ? 'OK' : 'WARN');

await pageD.screenshot({ path: 'val_mobile_fix_desktop.png', fullPage: false });
log('Screenshot — desktop dashboard', 'OK');

await browser.close();

// ── RESULTADO ──────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════');
const ok = results.filter(r => r.status === 'OK').length;
const warn = results.filter(r => r.status === 'WARN').length;
const fail = results.filter(r => r.status === 'FAIL').length;
console.log(`Resultado: ✅ ${ok} OK | ⚠️ ${warn} WARN | ❌ ${fail} FAIL`);
if (consoleErrors.length > 0) {
  console.log('Erros de console:');
  consoleErrors.forEach(e => console.log(' •', e));
} else {
  console.log('Sem erros de console críticos.');
}
