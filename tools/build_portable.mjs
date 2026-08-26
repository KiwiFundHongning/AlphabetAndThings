import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../web/node_modules/esbuild/lib/main.js';

const toolsDir = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(toolsDir, '..');
const webDir = join(projectDir, 'web');
const outputDir = join(projectDir, 'AlphabetAndThings-分享版');

if (dirname(outputDir) !== projectDir) {
  throw new Error('Portable output must stay inside the project directory');
}

const result = await build({
  absWorkingDir: webDir,
  entryPoints: [join(webDir, 'portable-entry.tsx')],
  bundle: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  format: 'iife',
  minify: true,
  platform: 'browser',
  target: ['chrome90', 'edge90', 'firefox88', 'safari14'],
  write: false,
});

const javascript = result.outputFiles.find((file) => file.path.endsWith('.js'))?.text
  ?? result.outputFiles[0]?.text;
if (!javascript) throw new Error('Portable JavaScript bundle was not produced');

const stylesheet = (await readFile(join(webDir, 'app', 'globals.css'), 'utf8'))
  .replace(/^@import\s+['"]tailwindcss['"];?\s*/m, '');

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="referrer" content="no-referrer">
  <meta name="color-scheme" content="light">
  <title>AlphabetAndThings｜字母、数字和好朋友</title>
  <link rel="icon" type="image/png" sizes="64x64" href="icon-64.png">
  <style>${stylesheet.replaceAll('</style', '<\\/style')}</style>
</head>
<body>
  <div id="root"></div>
  <script>${javascript.replaceAll('</script', '<\\/script')}</script>
</body>
</html>
`;

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
await writeFile(join(outputDir, '打开游戏.html'), html, 'utf8');
await writeFile(
  join(outputDir, '使用说明.txt'),
  [
    'AlphabetAndThings 使用说明',
    '',
    '1. 解压整个“AlphabetAndThings-分享版”文件夹。',
    '2. 双击“打开游戏.html”。',
    '3. 游戏会在默认浏览器中打开，无需安装、登录或联网。',
    '4. 每轮包含 3 个物品题和 2 个数字题。家长可在游戏内添加单个数字或数字区间。',
    '',
    '请不要只复制 HTML 文件；audio 和 things 文件夹也需要放在旁边。',
    '学习记录只保存在当前浏览器和当前设备中。',
  ].join('\r\n'),
  'utf8',
);
await cp(join(webDir, 'public', 'audio'), join(outputDir, 'audio'), { recursive: true });
await cp(join(webDir, 'public', 'things'), join(outputDir, 'things'), { recursive: true });
await cp(join(webDir, 'public', 'icon-64.png'), join(outputDir, 'icon-64.png'));
await cp(join(webDir, 'public', 'icon-192.png'), join(outputDir, 'icon-192.png'));

console.log(`Portable game created: ${outputDir}`);
