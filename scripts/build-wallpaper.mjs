import { mkdir, readFile, writeFile, copyFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'vite';
import tailwindcss from '@tailwindcss/postcss';
import { zipDirectory } from './zip-directory.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = join(root, 'dist', 'wallpaper-engine');
const output = join(destination, 'NAGI');
// Vite may empty only this fixed, project-local generated directory.
if (!output.startsWith(root + sep) || output !== join(root, 'dist', 'wallpaper-engine', 'NAGI')) {
  throw new Error('壁纸输出目录不在项目范围内');
}
const packages = new Set();
await build({
  root,
  configFile: false,
  publicDir: false,
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  css: { postcss: { plugins: [tailwindcss()] } },
  plugins: [{
    name: 'nagi-wallpaper-licenses',
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue;
        for (const id of Object.keys(chunk.modules)) {
          const normalized = id.replaceAll('\\', '/');
          const index = normalized.lastIndexOf('/node_modules/');
          if (index < 0) continue;
          const parts = normalized.slice(index + '/node_modules/'.length).split('/');
          packages.add(join(normalized.slice(0, index), 'node_modules',
            ...parts.slice(0, parts[0].startsWith('@') ? 2 : 1)));
        }
      }
    },
  }],
  build: {
    outDir: output,
    emptyOutDir: true,
    target: 'chrome100',
    sourcemap: false,
    lib: {
      entry: join(root, 'wallpaper', 'main.tsx'),
      name: 'NagiWallpaper',
      formats: ['iife'],
      fileName: () => 'assets/nagi.js',
      cssFileName: 'assets/nagi',
    },
  },
});

for (const name of ['index.html', 'host.js', 'project.json']) {
  await copyFile(join(root, 'wallpaper', name), join(output, name));
}
await copyFile(join(root, 'public', 'og.png'), join(output, 'preview.png'));
await copyFile(join(root, 'public', 'favicon.png'), join(output, 'favicon.png'));

const licenses = [
  await readFile(join(root, 'LICENSE'), 'utf8'),
  await readFile(join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8'),
];
for (const directory of [...packages].sort()) {
  const pkg = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  licenses.push(`## ${pkg.name} ${pkg.version}\nLicense: ${pkg.license ?? 'see notice'}`);
  const names = await readdir(directory);
  for (const name of names.filter((name) => /^(licen[cs]e|copying|notice)(\.|$)/i.test(name))) {
    licenses.push(await readFile(join(directory, name), 'utf8'));
  }
}
const script = join(output, 'assets', 'nagi.js');
const notices = licenses.join('\n\n---\n\n').replaceAll('*/', '* /');
await writeFile(script, `/*!\n${notices}\n*/\n` + await readFile(script, 'utf8'));

// 壁纸包仅允许运行资源，避免文档、构建记录或其他文件混入。
const allowedFiles = [
  'assets/nagi.css', 'assets/nagi.js', 'favicon.png', 'host.js',
  'index.html', 'preview.png', 'project.json',
].sort();
const files = [];
async function inventory(directory, prefix = '') {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const name = prefix + item.name;
    if (item.isDirectory()) await inventory(join(directory, item.name), name + '/');
    else files.push(name);
  }
}
await inventory(output);
if (JSON.stringify(files.sort()) !== JSON.stringify(allowedFiles)) {
  throw new Error(`壁纸包的文件列表不符合要求：${files.join(', ')}`);
}

const archive = join(destination, 'NAGI-Wallpaper-Engine.zip');
await mkdir(destination, { recursive: true });
await zipDirectory(output, archive);
const checksum = createHash('sha256').update(await readFile(archive)).digest('hex');
await writeFile(archive + '.sha256', `${checksum}  NAGI-Wallpaper-Engine.zip\n`);
console.log(`\n壁纸目录：${output}\n压缩包：${archive}\nSHA-256：${checksum}`);
