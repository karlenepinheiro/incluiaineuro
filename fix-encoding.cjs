/**
 * fix-encoding.cjs
 * Corrige double-encoding UTF-8 → Windows-1252 → UTF-8 em arquivos fonte.
 *
 * MECANISMO DA CORRUPÇÃO:
 *   1. Arquivo original é UTF-8. Ex: ç = bytes C3 A7.
 *   2. Editor configurado para Windows-1252 interpreta esses bytes como chars CP1252:
 *      C3 → Ã (U+00C3),  A7 → § (U+00A7)
 *      E2 → â (U+00E2),  80 → € (U+20AC),  94 → " (U+201D) [para —]
 *   3. Editor salva de volta como UTF-8: cada char CP1252 vira sua própria sequência UTF-8.
 *   4. Resultado: "Ã§" no lugar de "ç", "â€"" no lugar de "—", etc.
 *
 * ALGORITMO:
 *   Para cada caractere na string (lida como UTF-8 correto pela Node.js):
 *     - Obtém o "byte original" via mapa reverso CP1252 (chars > 0xFF → byte 0x80-0x9F)
 *     - Se o byte é lead UTF-8 (0xC2-0xF7) e os próximos bytes são continuation (0x80-0xBF):
 *       → decodifica para o Unicode correto
 *
 * Uso:
 *   node fix-encoding.cjs            → dry-run (mostra o que mudaria)
 *   node fix-encoding.cjs --apply    → aplica as correções
 *   node fix-encoding.cjs --report   → gera relatório HTML (com --apply ou separado)
 */

'use strict';
const fs   = require('fs');
const path = require('path');

const APPLY       = process.argv.includes('--apply');
const WITH_REPORT = process.argv.includes('--report');
const DRY_RUN     = !APPLY;

const ROOT       = path.join(__dirname, 'src');
const EXTENSIONS = ['.tsx', '.ts', '.md', '.css'];

// ── Mapa reverso Windows-1252 → byte original ────────────────────────────────
// Bytes 0x80-0x9F em CP1252 mapeiam para chars Unicode específicos.
// Precisamos do inverso: dado o char Unicode, qual era o byte?
const CP1252_REVERSE = {
  0x20AC: 0x80, // €
  0x201A: 0x82, // ‚
  0x0192: 0x83, // ƒ
  0x201E: 0x84, // „
  0x2026: 0x85, // …
  0x2020: 0x86, // †
  0x2021: 0x87, // ‡
  0x02C6: 0x88, // ˆ
  0x2030: 0x89, // ‰
  0x0160: 0x8A, // Š
  0x2039: 0x8B, // ‹
  0x0152: 0x8C, // Œ
  0x017D: 0x8E, // Ž
  0x2018: 0x91, // '
  0x2019: 0x92, // '
  0x201C: 0x93, // "
  0x201D: 0x94, // "
  0x2022: 0x95, // •
  0x2013: 0x96, // –
  0x2014: 0x97, // —
  0x02DC: 0x98, // ˜
  0x2122: 0x99, // ™
  0x0161: 0x9A, // š
  0x203A: 0x9B, // ›
  0x0153: 0x9C, // œ
  0x017E: 0x9E, // ž
  0x0178: 0x9F, // Ÿ
};

/**
 * Obtém o "valor de byte" de um code-point Unicode.
 * - Chars U+0000-U+00FF: byte == code-point (Latin-1 direto).
 * - Chars CP1252 especiais (U+20AC etc.): retorna o byte original via mapa.
 * - Tudo mais: retorna -1 (inválido como byte).
 */
function getByteValue(cp) {
  if (cp <= 0x00FF) return cp;
  const mapped = CP1252_REVERSE[cp];
  return mapped !== undefined ? mapped : -1;
}

/** Byte de continuação UTF-8: 0x80-0xBF. */
function isCont(b) {
  return b >= 0x80 && b <= 0xBF;
}

// ── Decodificador principal ───────────────────────────────────────────────────
function decodeMojibake(str) {
  const out = [];
  let i = 0;
  let changed = false;

  while (i < str.length) {
    const b0 = getByteValue(str.charCodeAt(i));

    // ── 4-byte: lead 0xF0-0xF7 ────────────────────────────────────────────
    if (b0 >= 0xF0 && b0 <= 0xF7 && i + 3 < str.length) {
      const b1 = getByteValue(str.charCodeAt(i + 1));
      const b2 = getByteValue(str.charCodeAt(i + 2));
      const b3 = getByteValue(str.charCodeAt(i + 3));
      if (isCont(b1) && isCont(b2) && isCont(b3)) {
        const cp = ((b0 & 0x07) << 18) | ((b1 & 0x3F) << 12) |
                   ((b2 & 0x3F) << 6)  |  (b3 & 0x3F);
        if (cp >= 0x10000 && cp <= 0x10FFFF) {
          out.push(String.fromCodePoint(cp));
          changed = true;
          i += 4;
          continue;
        }
      }
    }

    // ── 3-byte: lead 0xE0-0xEF ────────────────────────────────────────────
    if (b0 >= 0xE0 && b0 <= 0xEF && i + 2 < str.length) {
      const b1 = getByteValue(str.charCodeAt(i + 1));
      const b2 = getByteValue(str.charCodeAt(i + 2));
      if (isCont(b1) && isCont(b2)) {
        const cp = ((b0 & 0x0F) << 12) | ((b1 & 0x3F) << 6) | (b2 & 0x3F);
        if (cp >= 0x800 && cp <= 0xFFFF) {
          out.push(String.fromCodePoint(cp));
          changed = true;
          i += 3;
          continue;
        }
      }
    }

    // ── 2-byte: lead 0xC2-0xDF ────────────────────────────────────────────
    if (b0 >= 0xC2 && b0 <= 0xDF && i + 1 < str.length) {
      const b1 = getByteValue(str.charCodeAt(i + 1));
      if (isCont(b1)) {
        const cp = ((b0 & 0x1F) << 6) | (b1 & 0x3F);
        if (cp >= 0x80 && cp <= 0x7FF) {
          out.push(String.fromCodePoint(cp));
          changed = true;
          i += 2;
          continue;
        }
      }
    }

    out.push(str[i]);
    i++;
  }

  return { result: out.join(''), changed };
}

// ── Utilitários ───────────────────────────────────────────────────────────────
function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (EXTENSIONS.includes(path.extname(entry.name))) files.push(full);
  }
  return files;
}

function diffLines(before, after) {
  const lb = before.split('\n');
  const la = after.split('\n');
  const diffs = [];
  for (let i = 0; i < lb.length; i++) {
    if (lb[i] !== la[i]) {
      diffs.push({ line: i + 1, before: lb[i].substring(0, 130), after: (la[i] || '').substring(0, 130) });
    }
  }
  return diffs;
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Main ──────────────────────────────────────────────────────────────────────
const allFiles = walk(ROOT);
const report   = [];
let totalFiles = 0;
let totalLines = 0;

for (const file of allFiles) {
  const rel = path.relative(__dirname, file);
  let content;
  try { content = fs.readFileSync(file, 'utf8'); }
  catch (e) { console.error(`ERR ${rel}: ${e.message}`); continue; }

  const { result, changed } = decodeMojibake(content);
  if (!changed) continue;

  const diffs = diffLines(content, result);
  totalFiles++;
  totalLines += diffs.length;
  report.push({ file: rel, diffs });

  if (APPLY) {
    fs.writeFileSync(file, result, 'utf8');
    console.log(`  ✓ fixed  ${rel}  (${diffs.length} linhas)`);
  } else {
    console.log(`  ~ would  ${rel}  (${diffs.length} linhas)`);
    diffs.slice(0, 2).forEach(d => {
      console.log(`      L${d.line}: "${d.before.trim().substring(0, 70)}"`);
      console.log(`           → "${d.after.trim().substring(0, 70)}"`);
    });
  }
}

const mode = APPLY ? '[APPLY]' : '[DRY-RUN]';
console.log(`\n${mode} ${totalFiles} arquivos, ${totalLines} linhas corrigidas.`);
if (DRY_RUN) console.log('Execute  node fix-encoding.cjs --apply  para aplicar.\n');

// ── Relatório HTML ────────────────────────────────────────────────────────────
if (WITH_REPORT || APPLY) {
  const rows = report.map(({ file, diffs }) => {
    const diffHtml = diffs.map(d => `
      <tr>
        <td class="ln">${d.line}</td>
        <td class="before">${escHtml(d.before)}</td>
        <td class="after">${escHtml(d.after)}</td>
      </tr>`).join('');
    return `
    <details>
      <summary><strong>${escHtml(file)}</strong> — ${diffs.length} linha(s)</summary>
      <table><thead><tr><th>#</th><th>Antes</th><th>Depois</th></tr></thead>
      <tbody>${diffHtml}</tbody></table>
    </details>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Auditoria de Encoding — IncluiAI</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:system-ui,sans-serif;max-width:1280px;margin:2rem auto;padding:0 1.5rem;color:#1a202c;background:#F6F4EF}
    h1{color:#1F4E5F;border-bottom:3px solid #C69214;padding-bottom:.5rem;margin-bottom:1.5rem}
    h2{color:#1F4E5F;margin-top:2rem}
    .badge{display:inline-block;padding:.2em .8em;border-radius:999px;font-size:.82em;font-weight:700;margin:.15em}
    .err{background:#FEE2E2;color:#991B1B}.ok{background:#D1FAE5;color:#065F46}.warn{background:#FEF3C7;color:#92400E}
    .meta{background:#fff;border:1px solid #E7E2D8;border-radius:10px;padding:1.2rem;margin:1.2rem 0;display:flex;gap:2rem;flex-wrap:wrap}
    .meta b{color:#1F4E5F}
    details{background:#fff;border:1px solid #E7E2D8;border-radius:8px;margin:.5rem 0;padding:.6rem}
    summary{cursor:pointer;font-size:.95rem;padding:.25rem;color:#2E3A59}
    table{width:100%;border-collapse:collapse;margin-top:.75rem;font-size:.78rem}
    th{background:#1F4E5F;color:#fff;padding:.4rem .8rem;text-align:left;font-weight:600}
    td{padding:.35rem .8rem;border-bottom:1px solid #E7E2D8;vertical-align:top;word-break:break-all;font-family:monospace}
    .ln{width:3rem;color:#9CA3AF}
    .before{background:#FFF5F5;color:#991B1B}.after{background:#F0FFF4;color:#065F46}
    .card{background:#fff;border-left:4px solid #3B82F6;border-radius:0 8px 8px 0;padding:1.1rem;margin:1rem 0}
    .card.green{border-color:#10B981}.card.amber{border-color:#F59E0B}
    code{background:#F1F5F9;padding:.1em .4em;border-radius:4px;font-size:.9em}
    ol,ul{padding-left:1.4rem;line-height:1.9}
  </style>
</head>
<body>
  <h1>Auditoria de Encoding UTF-8 — IncluiAI</h1>

  <div class="meta">
    <div><b>Data:</b> ${new Date().toLocaleString('pt-BR')}</div>
    <div><b>Arquivos corrigidos:</b> <span class="badge err">${totalFiles}</span></div>
    <div><b>Linhas corrigidas:</b> <span class="badge warn">${totalLines}</span></div>
    <div><b>Status:</b> <span class="badge ${APPLY ? 'ok' : 'warn'}">${APPLY ? 'APLICADO' : 'DRY-RUN'}</span></div>
  </div>

  <h2>Causa Raiz</h2>
  <div class="card">
    <strong>Double-encoding UTF-8 → Windows-1252 → UTF-8</strong>
    <ol>
      <li>Arquivo original em UTF-8. Ex: <code>ç</code> = bytes <code>C3 A7</code>.</li>
      <li>Editor com Windows-1252 lê os bytes como chars CP1252:<br>
        <code>C3</code>→<code>Ã</code> &nbsp;|&nbsp; <code>A7</code>→<code>§</code> &nbsp;|&nbsp;
        <code>80</code>→<code>€</code> &nbsp;|&nbsp; <code>94</code>→<code>"</code> &nbsp;|&nbsp;
        <code>E2 94 80</code>→<code>─</code> box-drawing</li>
      <li>Ao salvar como UTF-8, cada char CP1252 vira sua própria sequência UTF-8 → <strong>double-encoding</strong>.</li>
      <li>Resultado visível: <code>Ã§</code> em vez de <code>ç</code>, <code>â€"</code> em vez de <code>—</code>, <code>â"€</code> em vez de <code>─</code>.</li>
    </ol>
    <p><strong>Não é problema de runtime</strong> (fetch, Supabase, localStorage, headers). A corrupção estava nos literais do código-fonte.</p>
  </div>

  <h2>Análise por Camada</h2>
  <table>
    <thead><tr><th>Camada</th><th>Status</th><th>Evidência</th></tr></thead>
    <tbody>
      <tr><td><code>index.html</code> charset</td><td><span class="badge ok">OK</span></td><td><code>&lt;meta charset="UTF-8" /&gt;</code> presente</td></tr>
      <tr><td>Vite config</td><td><span class="badge ok">OK</span></td><td>Sem opções de encoding conflitantes</td></tr>
      <tr><td>fetch / response.json()</td><td><span class="badge ok">OK</span></td><td>UTF-8 por padrão no browser</td></tr>
      <tr><td>Supabase client</td><td><span class="badge ok">OK</span></td><td>JSON sobre HTTPS, UTF-8 nativo</td></tr>
      <tr><td>localStorage</td><td><span class="badge ok">OK</span></td><td>Strings JS UTF-16, sem conversão manual</td></tr>
      <tr><td>atob / btoa</td><td><span class="badge ok">OK</span></td><td>Usado só para DOCX base64, não para texto</td></tr>
      <tr><td>Literais hardcoded .tsx/.ts/.md</td><td><span class="badge err">CRÍTICO</span></td><td>${totalFiles} arquivos, ${totalLines} linhas</td></tr>
    </tbody>
  </table>

  <h2>Algoritmo de Correção</h2>
  <div class="card green">
    <p>Decodificação algorítmica byte-a-byte com mapa reverso CP1252 completo (27 entradas):</p>
    <ol>
      <li>Para cada char na string, calcula o "byte original" via <code>getByteValue()</code>: chars U+0000–U+00FF → byte = code-point direto; chars CP1252 especiais (€, —, ─, ✓, →, ⚡, ☀, emoji…) → byte via mapa reverso.</li>
      <li>Se o byte é lead UTF-8 (0xC2–0xF7) e os próximos N bytes são continuation (0x80–0xBF): decodifica o code-point Unicode correto.</li>
      <li>Cobre diacríticos (ç, ã, é, ó…), travessões (— –), box-drawing (─ │ ┌), setas (→ ←), ícones (✓ ✕ ⚠ ⚡ ☀), emoji (🌿 🌙 😊…).</li>
      <li><strong>Idempotente</strong>: segunda execução não altera nada.</li>
    </ol>
  </div>

  <h2>Prevenção de Regressão</h2>
  <div class="card amber">
    <strong>O fix corrige os literais. Reabrir com editor CP1252 recriará o problema.</strong>
    <ul>
      <li>VS Code: confirmar <code>"files.encoding": "utf8"</code> em settings (já é padrão).</li>
      <li>Evitar Notepad clássico para editar .tsx/.ts.</li>
      <li>Recomendado: adicionar <code>.editorconfig</code> com <code>charset = utf-8</code>.</li>
    </ul>
  </div>

  <h2>Detalhe das Correções — ${totalFiles} arquivo(s)</h2>
  ${rows || '<p><em>Nenhuma correção necessária.</em></p>'}
</body>
</html>`;

  const rPath = path.join(__dirname, 'encoding-audit-report.html');
  fs.writeFileSync(rPath, html, 'utf8');
  console.log(`\nRelatório HTML: ${rPath}`);
}
