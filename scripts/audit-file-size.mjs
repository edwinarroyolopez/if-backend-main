import { promises as fs } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const includeDirs = ['src', 'test', 'scripts'];
const ignore = new Set(['node_modules', 'dist', 'coverage']);
const findings = [];

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (ignore.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath);
      continue;
    }

    if (!/\.(ts|js|mjs)$/.test(entry.name)) continue;
    const relative = path.relative(root, fullPath);
    const lines = (await fs.readFile(fullPath, 'utf8')).split('\n').length;

    if (relative.endsWith('.controller.ts') && lines > 150) {
      findings.push(`${relative} :: controller exceeds 150 lines (${lines})`);
      continue;
    }
    if (relative.endsWith('.service.ts') && lines > 300) {
      findings.push(`${relative} :: service exceeds 300 lines (${lines})`);
      continue;
    }
    if (lines > 400) {
      findings.push(`${relative} :: file exceeds 400 lines (${lines})`);
    }
  }
}

await Promise.all(
  includeDirs.map(async (dir) => {
    try {
      await walk(path.join(root, dir));
    } catch {
      // ignore missing directories
    }
  }),
);

if (findings.length > 0) {
  findings.forEach((finding) => console.error(finding));
  process.exit(1);
}

console.log('File size audit passed.');
