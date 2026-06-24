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

    if (!/\.(ts|mjs)$/.test(entry.name)) continue;
    const relative = path.relative(root, fullPath);
    const content = await fs.readFile(fullPath, 'utf8');

    if (/forwardRef\(/.test(content)) {
      findings.push(`${relative} :: forwardRef is not allowed`);
    }
    if (relative.endsWith('.controller.ts') && /@InjectModel\(/.test(content)) {
      findings.push(`${relative} :: controllers must not inject Mongoose models`);
    }
    if (/exports:\s*\[[^\]]*MongooseModule/.test(content)) {
      findings.push(`${relative} :: modules must not export MongooseModule`);
    }
    if (
      /process\.env/.test(content) &&
      !relative.endsWith('src/platform/config/app-config.ts') &&
      !relative.endsWith('test/mongo-replset.ts')
    ) {
      findings.push(`${relative} :: direct process.env access is forbidden outside config/test env helper`);
    }
    if (relative.endsWith('.controller.ts') && /role\s*===|role\s*!==/.test(content)) {
      findings.push(`${relative} :: controllers must not hardcode role checks`);
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

console.log('Architecture audit passed.');
