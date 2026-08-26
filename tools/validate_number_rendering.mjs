import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../web/node_modules/esbuild/lib/main.js';

const toolsDir = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(toolsDir, '..');
const dataFile = join(projectDir, 'web', 'app', 'game-data.ts');
const temporaryBundle = join(projectDir, 'web', '.vinext', 'number-rendering-check.mjs');

await build({
  entryPoints: [dataFile],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: ['node20'],
  outfile: temporaryBundle,
});

const data = await import(`${pathToFileURL(temporaryBundle).href}?check=${Date.now()}`);
const cases = [
  [0, 'Zero', '零'],
  [10, 'Ten', '十'],
  [21, 'Twenty one', '二十一'],
  [40, 'Forty', '四十'],
  [101, 'One hundred one', '一百零一'],
  [10_001, 'Ten thousand one', '一万零一'],
  [1_001_001, 'One million one thousand one', '一百万一千零一'],
  [999_999_999, 'Nine hundred ninety nine million nine hundred ninety nine thousand nine hundred ninety nine', '九亿九千九百九十九万九千九百九十九'],
];

for (const [value, english, chinese] of cases) {
  if (data.numberToEnglish(value) !== english || data.numberToChinese(value) !== chinese) {
    throw new Error(`Unexpected rendering for ${value}: ${data.numberToEnglish(value)} / ${data.numberToChinese(value)}`);
  }
  const item = data.createNumberItem(value);
  const sources = item.audioParts?.map((part) => part.src) ?? [item.audio];
  for (const source of sources) {
    if (!source || !existsSync(join(projectDir, 'web', 'public', source))) {
      throw new Error(`Missing narration part for ${value}: ${source}`);
    }
  }
}

console.log(`PASS: ${cases.length} boundary and representative numbers render with complete local narration`);
