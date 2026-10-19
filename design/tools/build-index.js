#!/usr/bin/env node
/**
 * Writes design/index.md from the canvas index (canvas.json) and the board sources.
 *   node build-index.js --canvas=<canvas.json> --site=<dir with .dc.html> --list=<export list> --out=<index.md>
 * Boards are grouped by the canvas row they sit in (the row's title note); boards that are files
 * without a place in canvas.json go to their own group, named by their <title>.
 */
const fs = require('fs');
const path = require('path');

const arg = (name) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || '').slice(name.length + 3);
const canvas = JSON.parse(fs.readFileSync(arg('canvas'), 'utf8'));
const site = arg('site');
const list = fs.readFileSync(arg('list'), 'utf8').split('\n').filter(Boolean);
const rendered = new Set(fs.readdirSync(path.join(path.dirname(arg('out')), 'screens')).map((f) => f.replace(/\.png$/, '')));

const htmlTitle = (name) => {
  const m = /<title>([^<]*)<\/title>/.exec(fs.readFileSync(path.join(site, `${name}.dc.html`), 'utf8'));
  const text = (m ? m[1] : name).replace(/^Daftar — /, '');
  return text.charAt(0).toUpperCase() + text.slice(1);
};
const isDark = (name, title) => /Dark$/.test(name) || /тёмн/i.test(title);
const size = (name) => {
  const m = /data-props='([^']*)'/.exec(fs.readFileSync(path.join(site, `${name}.dc.html`), 'utf8'));
  try { const p = JSON.parse(m[1]).$preview; return `${p.width}×${p.height}`; } catch { return '390×844'; }
};

const onScreens = (v) => !v.page || v.page === 'screens';
const notes = Object.values(canvas.notes || {}).filter((n) => n.kind === 'title1' && onScreens(n));
const sections = new Map(); // note text → boards
const placed = new Set();
const boards = Object.entries(canvas.boards)
  .map(([file, v]) => ({ name: file.replace(/\.dc\.html$/, ''), ...v }))
  .filter((b) => onScreens(b) && list.includes(b.name))
  .sort((a, b) => a.y - b.y || a.x - b.x);
for (const b of boards) {
  // The row's title sits above the row; with two titles in one row, the board belongs to the one on its left
  const candidates = notes.filter((n) => n.y < b.y && b.y - n.y <= 400 && n.x <= b.x).sort((p, q) => q.x - p.x);
  const section = candidates[0] ? candidates[0].text : 'Без заголовка';
  if (!sections.has(section)) sections.set(section, []);
  sections.get(section).push({ name: b.name, title: b.title || htmlTitle(b.name) });
  placed.add(b.name);
}
const loose = list.filter((n) => !placed.has(n)).map((n) => ({ name: n, title: htmlTitle(n) }));

const cell = (s) => s.replace(/\|/g, '\\|');
const row = ({ name, title }) => {
  const screen = rendered.has(name) ? `[png](screens/${name}.png)` : '—';
  return `| ${cell(title)} | ${isDark(name, title) ? 'тёмная' : 'светлая'} | ${size(name)} | ${screen} | [${name}.dc.html](prototype/${name}.dc.html) |`;
};

const out = [];
out.push('# Доски «Пастели»: название → файлы');
out.push('');
out.push('Ищите по названию из поля `Design` задачи. Название ряда (заголовок раздела ниже) означает все доски');
out.push('ряда. Кавычки «» и „“ в названиях равнозначны. Как собрано и что сюда не вошло — [README](README.md).');
out.push('');
let count = 0;
for (const [section, items] of sections) {
  out.push(`## ${section}`, '', '| Доска | Тема | Размер | Экран | Исходник |', '|---|---|---|---|---|');
  for (const item of items) { out.push(row(item)); count += 1; }
  out.push('');
}
if (loose.length) {
  out.push('## Доски вне индекса холста');
  out.push('');
  out.push('Эти файлы есть на холсте, но не в его индексе: на холсте у них нет своей подписи, название взято из');
  out.push('`<title>` файла. `Pastel_DemoFrame` — рамка показа, своей картинки у неё нет.');
  out.push('', '| Доска | Тема | Размер | Экран | Исходник |', '|---|---|---|---|---|');
  for (const item of loose) { out.push(row(item)); count += 1; }
  out.push('');
}
fs.writeFileSync(arg('out'), out.join('\n'));
console.log(`index: ${count} boards in ${sections.size} sections + ${loose.length} outside the canvas index`);
