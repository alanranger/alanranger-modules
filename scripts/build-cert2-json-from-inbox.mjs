/**
 * Extract c2-*.json from Claude CERT2-content-*.md inbox files.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const INBOX =
  'C:/Users/alan/Google Drive/Claude shared resources/Claude Questions for Cursor';
const CANON = join(
  'G:/Dropbox/alan ranger photography/Website Code/Academy/alanranger-academy-assesment/alanranger-modules/modules'
);
const MIRROR = join(
  'G:/Dropbox/alan ranger photography/Website Code/Academy/alanranger-academy-assesment/modules'
);

const files = readdirSync(INBOX).filter((f) => f.startsWith('CERT2-content-c2-') && f.endsWith('.md'));
if (files.length !== 15) {
  console.warn(`Expected 15 content files, found ${files.length}`);
}

mkdirSync(CANON, { recursive: true });
mkdirSync(MIRROR, { recursive: true });

for (const file of files.sort()) {
  const raw = readFileSync(join(INBOX, file), 'utf8');
  const m = raw.match(/```json\s*([\s\S]*?)```/);
  if (!m) throw new Error(`No JSON block in ${file}`);
  const json = JSON.parse(m[1]);
  if (!json.moduleId || !Array.isArray(json.questions)) {
    throw new Error(`Invalid schema in ${file}`);
  }
  for (const q of json.questions) {
    if (!Array.isArray(q.options) || q.options.length !== 4) {
      throw new Error(`${file}: question must have 4 options`);
    }
    if (q.correct < 0 || q.correct > 3) {
      throw new Error(`${file}: correct index out of range`);
    }
  }
  const outName = `${json.moduleId}.json`;
  const text = JSON.stringify(json, null, 2) + '\n';
  writeFileSync(join(CANON, outName), text, 'utf8');
  writeFileSync(join(MIRROR, outName), text, 'utf8');
  console.log(`OK ${outName} (${json.questions.length} questions)`);
}

console.log('Done:', files.length, 'modules');
