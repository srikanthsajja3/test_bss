// scripts/fix-web-assets.js — run after `expo export -p web` (npm run build does it for you).
//
// Expo puts package assets (the @expo/vector-icons fonts etc.) under
//   dist/assets/node_modules/@expo/vector-icons/build/vendor/.../Fonts/Feather.<hash>.ttf
// Hostinger, FTP clients and zip tools often skip folders called "node_modules" (and some
// mishandle "@" folders), so the fonts 404 and every icon is blank. This script:
//   1. moves every file under dist/assets/node_modules into one flat folder dist/assets/lib/
//      (file names already carry a content hash, so they stay unique),
//   2. rewrites the paths inside the built JS/HTML/CSS/JSON,
//   3. renames each rewritten JS bundle to a new file name and updates index.html, so no
//      browser or Hostinger CDN cache can keep serving the old bundle with the old paths,
//   4. writes dist/.htaccess (font MIME types, caching; index.html never cached).
// Usage: node scripts/fix-web-assets.js [distDir]   (default: dist)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dist = path.resolve(process.argv[2] || 'dist');
const srcRoot = path.join(dist, 'assets', 'node_modules');
const libDir = path.join(dist, 'assets', 'lib');
if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error(`fix-web-assets: ${dist}/index.html not found — run "expo export -p web" first`);
  process.exit(1);
}

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};
const toUrl = (p) => '/' + path.relative(dist, p).split(path.sep).join('/');

// 1. flatten assets/node_modules/** -> assets/lib/<file>
const moves = []; // [oldUrlWithoutLeadingSlash, newUrlWithoutLeadingSlash]
if (fs.existsSync(srcRoot)) {
  fs.mkdirSync(libDir, { recursive: true });
  const used = new Map();
  for (const f of walk(srcRoot)) {
    let name = path.basename(f);
    if (used.has(name)) {
      const h = crypto.createHash('md5').update(path.relative(srcRoot, f)).digest('hex').slice(0, 8);
      name = `${path.parse(name).name}.${h}${path.extname(name)}`;
    }
    used.set(name, true);
    const dest = path.join(libDir, name);
    fs.renameSync(f, dest);
    moves.push([toUrl(f).slice(1), toUrl(dest).slice(1)]);
  }
  fs.rmSync(srcRoot, { recursive: true, force: true });
}

// 2. rewrite references (longest paths first). Bundles may reference "/assets/node_modules/..."
//    (also URL-encoded "%40expo") — handle both.
moves.sort((a, b) => b[0].length - a[0].length);
const textExt = new Set(['.js', '.html', '.css', '.json', '.map']);
const renamedJs = []; // [oldUrl, newUrl]
let hits = 0;
for (const f of walk(dist)) {
  if (!textExt.has(path.extname(f))) continue;
  let s = fs.readFileSync(f, 'utf8');
  const before = s;
  for (const [from, to] of moves) {
    for (const variant of [from, from.replace(/@/g, '%40')]) {
      if (s.includes(variant)) {
        hits += s.split(variant).length - 1;
        s = s.split(variant).join(to);
      }
    }
  }
  if (s.includes('assets/node_modules/')) {
    // anything we could not map file-by-file (e.g. a path built at runtime)
    hits += s.split('assets/node_modules/').length - 1;
    s = s.split('assets/node_modules/').join('assets/lib/');
  }
  if (s === before) continue;
  fs.writeFileSync(f, s);
  // 3. new file name for changed JS bundles: <name>-<oldhash>.js -> <name>-<newhash>.js
  if (path.extname(f) === '.js' && f.includes(`${path.sep}_expo${path.sep}`)) {
    const hash = crypto.createHash('md5').update(s).digest('hex');
    const base = path.basename(f, '.js').replace(/-[0-9a-f]{16,}$/, '');
    const nf = path.join(path.dirname(f), `${base}-${hash}.js`);
    fs.renameSync(f, nf);
    renamedJs.push([toUrl(f), toUrl(nf)]);
  }
}
if (renamedJs.length) {
  for (const f of walk(dist)) {
    if (!['.html', '.json'].includes(path.extname(f))) continue;
    let s = fs.readFileSync(f, 'utf8');
    const before = s;
    for (const [from, to] of renamedJs) s = s.split(from).join(to).split(from.slice(1)).join(to.slice(1));
    if (s !== before) fs.writeFileSync(f, s);
  }
}

// 4. .htaccess for Hostinger (Apache/LiteSpeed)
fs.writeFileSync(
  path.join(dist, '.htaccess'),
  [
    'AddType font/ttf .ttf',
    'AddType font/otf .otf',
    'AddType font/woff .woff',
    'AddType font/woff2 .woff2',
    '<IfModule mod_headers.c>',
    '  <FilesMatch "\\.(ttf|otf|woff2?|png|jpe?g|svg|js|css)$">',
    '    Header set Cache-Control "public, max-age=31536000, immutable"',
    '  </FilesMatch>',
    '  <FilesMatch "\\.html$">',
    '    Header set Cache-Control "no-cache, no-store, must-revalidate"',
    '  </FilesMatch>',
    '</IfModule>',
    '',
  ].join('\n')
);

const left = walk(dist).filter((f) => textExt.has(path.extname(f)) && fs.readFileSync(f, 'utf8').includes('node_modules/'));
console.log(`fix-web-assets: moved ${moves.length} file(s) to assets/lib, rewrote ${hits} path(s)`);
for (const [a, b] of renamedJs) console.log(`fix-web-assets: bundle ${a} -> ${b}`);
if (left.length) console.log('fix-web-assets: WARNING still mentions node_modules/:', left.map(toUrl).join(', '));
