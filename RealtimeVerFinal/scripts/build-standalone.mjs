import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'dist');
const outFile = path.join(outDir, 'airacing-standalone.html');

const moduleFiles = [
  'js/horses.js',
  'js/game.js',
  'js/renderer.js',
  'js/teams.js',
  'js/main.js',
];

const assetFiles = [
  'image/background.png',
  'image/horse_1.png',
  'image/horse_2.png',
  'image/horse_3.png',
  'image/horse_4.png',
  'image/horse_5.png',
  'image/horse_6.png',
  'image/horse_7.png',
  'image/horse_8.png',
  'bgm/mainLobby.mp3',
  'bgm/RaceCount.wav',
  'bgm/StartGun.wav',
];

const mimeByExt = {
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

async function readText(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

async function toDataUrl(relativePath) {
  const ext = path.extname(relativePath).toLowerCase();
  const mime = mimeByExt[ext];
  if (!mime) throw new Error(`No MIME type configured for ${relativePath}`);

  const data = await readFile(path.join(root, relativePath));
  return `data:${mime};base64,${data.toString('base64')}`;
}

function toClassicScript(source) {
  return source
    .replace(/^\s*import\s+[^;]+;\s*$/gm, '')
    .replace(/\bexport\s+(?=(const|let|var|function|class)\b)/g, '')
    .replace(
      'img.src = src;',
      'img.src = EMBEDDED_ASSET_URLS[src] || src;'
    )
    .replace(
      'const audio = new Audio(src);',
      'const audio = new Audio(EMBEDDED_ASSET_URLS[src] || src);'
    );
}

function escapeScript(source) {
  return source.replace(/<\/script/gi, '<\\/script');
}

async function buildBundle(assetMap) {
  const chunks = [];
  chunks.push(`const EMBEDDED_ASSET_URLS = ${JSON.stringify(assetMap)};`);

  for (const file of moduleFiles) {
    const source = await readText(file);
    chunks.push(`\n/* ${file} */\n${toClassicScript(source)}`);
  }

  return escapeScript(chunks.join('\n'));
}

async function main() {
  const [html, css] = await Promise.all([
    readText('index.html'),
    readText('css/style.css'),
  ]);

  const assetEntries = await Promise.all(
    assetFiles.map(async file => [file, await toDataUrl(file)])
  );
  const assetMap = Object.fromEntries(assetEntries);
  const bundle = await buildBundle(assetMap);
  new Function(bundle);

  const standalone = html
    .replace(
      /<link\s+rel="stylesheet"\s+href="css\/style\.css"\s*>/i,
      `<style>\n${css}\n</style>`
    )
    .replace(
      /src="bgm\/mainLobby\.mp3"/i,
      `src="${assetMap['bgm/mainLobby.mp3']}"`
    )
    .replace(
      /<script\s+type="module"\s+src="js\/main\.js"><\/script>/i,
      `<script>\n${bundle}\n</script>`
    );

  await mkdir(outDir, { recursive: true });
  await writeFile(outFile, standalone, 'utf8');
  console.log(`Wrote ${path.relative(root, outFile)}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
