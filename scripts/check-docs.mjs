// Auditoria mecânica dos docs (ver docs/self-improvement.md).
//
// Checa três coisas que não exigem julgamento:
//   1. todo link de doc para arquivo (código ou markdown) resolve;
//   2. toda linha citada no rótulo do link ([arquivo.ts:NN]) existe no arquivo;
//   3. nenhuma regra do CLAUDE.md foi copiada para um doc de escopo (duplicação).
//
// O que ele NÃO checa, porque exige julgamento: se a linha citada ainda FAZ o
// que o doc afirma. Isso é conferência manual por amostragem.
//
// Uso: node scripts/check-docs.mjs   (sai != 0 se achar problema)
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const CODE = /\.(ts|tsx|css|yml|mjs|json|html)$/;

const docs = [];
for (const dir of ['docs', 'docs/decisions']) {
  for (const f of readdirSync(`${ROOT}/${dir}`)) {
    if (f.endsWith('.md')) docs.push(`${dir}/${f}`);
  }
}

let problems = 0;
const fail = (msg) => {
  console.log(msg);
  problems++;
};

// 1 e 2 — ponteiros
let refs = 0;
for (const doc of docs) {
  const text = readFileSync(`${ROOT}/${doc}`, 'utf8');
  for (const [, label, target] of text.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)) {
    if (target.startsWith('http')) continue;
    const clean = target.split('#')[0];
    if (!CODE.test(clean) && !clean.endsWith('.md') && !clean.endsWith('/')) continue;
    refs++;
    const abs = resolve(`${ROOT}/${dirname(doc)}`, clean);
    if (!existsSync(abs)) {
      fail(`destino inexistente   ${doc}: [${label}](${target})`);
      continue;
    }
    const m = label.match(/^([\w.\-/]+):(\d+)$/);
    if (!m || !CODE.test(m[1])) continue;
    if (basename(abs) !== basename(m[1])) {
      fail(`rótulo x destino      ${doc}: rótulo cita ${m[1]} mas linka ${clean}`);
      continue;
    }
    const total = readFileSync(abs, 'utf8').split('\n').length;
    if (Number(m[2]) > total) {
      fail(`linha fora do arquivo ${doc}: ${m[1]}:${m[2]} (o arquivo tem ${total})`);
    }
  }
}

// 3 — regra duplicada: pedaços distintivos dos bullets do CLAUDE.md
const chunks = readFileSync(`${ROOT}/CLAUDE.md`, 'utf8')
  .split('\n')
  .filter((l) => l.startsWith('- **'))
  .flatMap((l) => l.split(/[;.]\s+/))
  .map((s) => s.replace(/[*`]/g, '').trim())
  .filter((s) => s.split(' ').length >= 8);

for (const doc of docs) {
  const text = readFileSync(`${ROOT}/${doc}`, 'utf8').replace(/[*`]/g, '');
  for (const c of chunks) {
    if (text.includes(c)) {
      fail(`regra duplicada       ${doc}\n                      ← "${c.slice(0, 90)}…"`);
    }
  }
}

console.log(
  `\n${docs.length} docs · ${refs} ponteiros · ${chunks.length} trechos de regra testados → ` +
    (problems ? `${problems} problema(s)` : 'ok'),
);
process.exit(problems ? 1 : 0);
