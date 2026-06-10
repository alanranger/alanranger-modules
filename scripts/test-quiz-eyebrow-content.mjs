/**
 * Verifies quiz eyebrow ::before computed content (numeric vs string CSS var).
 * Run: node scripts/test-quiz-eyebrow-content.mjs
 */
import { chromium } from 'playwright';
import { writeFileSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(__dir, '_eyebrow-test-temp.html');

function buildHtml(setVarLine) {
  return `<!DOCTYPE html><html><head><style>
#quiz-form{counter-reset:ar-q-num 0}
.ar-field{counter-increment:ar-q-num}
.ar-qtxt::before{
  content:"QUESTION " counter(ar-q-num) " OF " var(--ar-quiz-total)!important;
  display:block;
}
</style></head><body>
<form id="quiz-form">
<div class="ar-field"><div class="ar-qtxt">Question text</div></div>
</form>
<script>
const quizForm=document.getElementById('quiz-form');
${setVarLine}
</script>
</body></html>`;
}

async function computedContent(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.ar-qtxt');
    return getComputedStyle(el, '::before').content;
  });
}

const cases = [
  { name: 'numeric-var (v2.64/v2.65 — invalid, expect none)', line: "quizForm.style.setProperty('--ar-quiz-total', String(12));", expectOk: false },
  { name: 'string-var (v2.66 fix)', line: "quizForm.style.setProperty('--ar-quiz-total', '\"' + 12 + '\"');", expectOk: true },
];

let failed = false;
const browser = await chromium.launch({ headless: true });

for (const c of cases) {
  writeFileSync(htmlPath, buildHtml(c.line));
  const page = await browser.newPage();
  await page.goto('file:///' + htmlPath.replace(/\\/g, '/'));
  const content = await computedContent(page);
  const ok = content !== 'none' && content.includes('12');
  const expectOk = c.expectOk;
  const pass = ok === expectOk;
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${c.name} | computed content: ${JSON.stringify(content)}`);
  if (!pass) failed = true;
  await page.close();
}

await browser.close();
try { unlinkSync(htmlPath); } catch (_) {}

if (failed) {
  console.error('\nEyebrow test FAILED — do not ship.');
  process.exit(1);
}
console.log('\nAll eyebrow tests passed.');
