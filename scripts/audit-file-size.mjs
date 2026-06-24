import { promises as fs } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const includeDirs = ['src', 'test', 'scripts'];
const ignore = new Set(['node_modules', 'dist', 'coverage']);
const findings = [];
const CONTROLLER_LINE_LIMIT = 160;
const SERVICE_LINE_LIMIT = 350;
const FILE_LINE_LIMIT = 450;

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

    if (relative.endsWith('.controller.ts') && lines > CONTROLLER_LINE_LIMIT) {
      findings.push(
        `${relative} :: controller exceeds ${CONTROLLER_LINE_LIMIT} lines (${lines})`,
      );
      continue;
    }
    if (relative.endsWith('.service.ts') && lines > SERVICE_LINE_LIMIT) {
      findings.push(
        `${relative} :: service exceeds ${SERVICE_LINE_LIMIT} lines (${lines})`,
      );
      continue;
    }
    if (lines > FILE_LINE_LIMIT) {
      findings.push(`${relative} :: file exceeds ${FILE_LINE_LIMIT} lines (${lines})`);
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
