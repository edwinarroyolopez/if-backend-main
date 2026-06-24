import { promises as fs } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const includeDirs = ['src', 'test', 'scripts'];
const ignore = new Set(['node_modules', 'dist', 'coverage']);
const findings = [];
const secretPatterns = [
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
  /ghp_[A-Za-z0-9]{20,}/,
  /sk_live_[A-Za-z0-9]+/,
  /AIza[0-9A-Za-z\-_]{20,}/,
];

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (ignore.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath);
      continue;
    }

    if (!/\.(ts|js|mjs|md|json|yml|yaml|env)$/.test(entry.name)) continue;
    const relative = path.relative(root, fullPath);
    const content = await fs.readFile(fullPath, 'utf8');
    for (const pattern of secretPatterns) {
      if (pattern.test(content)) {
        findings.push(`${relative} :: matched secret pattern ${pattern}`);
      }
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

console.log('Secret audit passed.');
