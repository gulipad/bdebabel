// After the build: en.html, the city's page with the English edition's head, for every /en link (vercel.json).
// Link previews (X, WhatsApp, Slack…) don't run the city's script, so without it an English link was shared with
// the Spanish edition's title, words and card. The words are the ones the layout puts on the page in the browser.
import { readFileSync, writeFileSync } from 'node:fs';
const build = new URL('../app/build/', import.meta.url);
const meta = JSON.parse(readFileSync(new URL('../app/src/lib/english-meta.json', import.meta.url), 'utf8'));
let html = readFileSync(new URL('index.html', build), 'utf8').replace('<html lang="es">', '<html lang="en">');
for (const [key, content] of Object.entries(meta)) {
	const tag = new RegExp(`(<meta\\s+(?:name|property)="${key}"\\s+content=")[^"]*(")`);
	if (!tag.test(html)) throw new Error(`english-head: no ${key} tag in index.html`);
	html = html.replace(tag, `$1${content.replace(/"/g, '&quot;')}$2`);
}
writeFileSync(new URL('en.html', build), html);
console.log(`english-head: en.html (${Object.keys(meta).length} tags)`);
