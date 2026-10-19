// Every name in a task's Design field must be a board or a section (row) in design/index.md.
// Quotes «» and „“ count as the same; a section may be named by the start of its heading.
const fs = require('fs');
const [tasksFile, indexFile] = process.argv.slice(2);
const norm = (s) => s.replace(/[„“”]/g, (q) => (q === '„' ? '«' : '»')).replace(/\s+/g, ' ').trim();

const index = fs.readFileSync(indexFile, 'utf8').split('\n');
const boards = new Set(index.filter((l) => l.startsWith('| ') && !l.startsWith('| Доска')).map((l) => norm(l.split(' | ')[0].slice(2).replace(/\\\|/g, '|'))));
const sections = index.filter((l) => l.startsWith('## ')).map((l) => norm(l.slice(3)));

let task = null; let refs = 0; const unresolved = [];
for (const line of fs.readFileSync(tasksFile, 'utf8').split('\n')) {
  const m = /^### (FT-\d+)/.exec(line); if (m) task = m[1];
  if (!line.startsWith('Design:')) continue;
  const text = line.slice('Design:'.length).trim().replace(/^ряд /, '');
  if (!text.startsWith('«') && !text.startsWith('„')) continue; // component references, not boards
  const names = norm(text.split(', [')[0]).replace(/^«/, '').replace(/»\.?$/, '').split('», «');
  for (const name of names) {
    refs += 1;
    const hit = boards.has(name) ? 'board' : sections.find((s) => s === name || s.startsWith(name)) ? 'section' : null;
    if (!hit) unresolved.push(`${task}: «${name}»`);
  }
}
console.log(`Design references: ${refs}, unresolved: ${unresolved.length}`);
unresolved.forEach((u) => console.log(`  ${u}`));
