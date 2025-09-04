import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const slug = process.argv[2] || 'module-01';
const moduleJsonPath = resolve('src/modules', `${slug}.json`);
const templatePath   = resolve('src/template.html');
const cssPath        = resolve('src/styles.css');
const enginePath     = resolve('src/engine.js');

async function main(){
  const [tpl, css, js, mod] = await Promise.all([
    readFile(templatePath,'utf8'),
    readFile(cssPath,'utf8'),
    readFile(enginePath,'utf8'),
    readFile(moduleJsonPath,'utf8')
  ]);

  const moduleObj = JSON.parse(mod);
  const out = tpl
    .replace(/{{MODULE_TITLE}}/g, moduleObj.title)
    .replace('{{STYLES}}', css)
    .replace('{{MODULE_JSON}}', JSON.stringify(moduleObj))
    .replace('{{SCRIPT}}', js);

  const outPath = resolve('dist', `${slug}.html`);
  await writeFile(outPath, out, 'utf8');
  console.log(`✔ Built ${outPath}`);
}

main().catch(err=>{ console.error(err); process.exit(1); });
