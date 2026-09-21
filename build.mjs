// Bundelt de pagina tot één bestand (dist/index.html) zonder losse modules,
// zodat ze ook werkt waar ES-modules niet geladen kunnen worden.
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const strip = (src) => src.replace(/^import[\s\S]*?from '.*?';\s*$/gm, '').replace(/^export (?=(const|function|let|class))/gm, '');
const engine = strip(await readFile('js/engine.js', 'utf8'));
const advisor = strip(await readFile('js/advisor.js', 'utf8'));
const app = strip(await readFile('js/app.js', 'utf8'));
const css = await readFile('css/style.css', 'utf8');
let html = await readFile('index.html', 'utf8');
html = html.replace('<link rel="stylesheet" href="css/style.css">', `<style>\n${css}\n</style>`);
html = html.replace('<script type="module" src="js/app.js"></script>', `<script type="module">\n${engine}\n${advisor}\n${app}\n</script>`);
await mkdir('dist', { recursive: true });
await writeFile('dist/index.html', html);
// Versie zonder document-omhulsel, voor hosts die de pagina zelf inpakken.
const inner = html.replace(/^[\s\S]*?<head>\s*/, '').replace(/<meta[^>]*>\s*/g, '').replace(/<\/head>\s*<body>\s*/, '').replace(/\s*<\/body>\s*<\/html>\s*$/, '\n');
await writeFile('dist/manillen-coach.html', inner);
console.log('dist/index.html en dist/manillen-coach.html gebouwd');
