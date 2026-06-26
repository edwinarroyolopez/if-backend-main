import { promises as fs } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const includeDirs = ['src', 'test', 'scripts'];
const ignoreDirs = new Set(['node_modules', 'dist', 'build', 'coverage']);
const ignoredFiles = new Set([
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
]);
const findings = [];
const FILE_LINE_LIMIT = 300;

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && ignoreDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath);
      continue;
    }

    if (!isAuditedFile(fullPath, entry.name)) continue;
    const relative = path.relative(root, fullPath);
    const content = await fs.readFile(fullPath, 'utf8');
    if (isGeneratedArtifact(relative, content)) continue;
    const lines = countPhysicalLines(content);

    if (lines > FILE_LINE_LIMIT) {
      findings.push(
        `${normalizePath(relative)} :: ${lines} lines exceeds limit ${FILE_LINE_LIMIT}`,
      );
    }
  }
}

function isAuditedFile(fullPath, fileName) {
  if (ignoredFiles.has(fileName)) return false;

  const relative = normalizePath(path.relative(root, fullPath));
  if (/^src\/.*\.ts$/.test(relative)) return true;
  if (/^test\/.*\.ts$/.test(relative)) return true;
  return /^scripts\/.*\.(?:js|mjs|cjs|ts)$/.test(relative);
}

function isGeneratedArtifact(relative, content) {
  const normalized = normalizePath(relative);
  if (/\/generated\//.test(`/${normalized}/`)) return true;
  if (/\.generated\.(?:ts|js|mjs|cjs)$/.test(normalized)) return true;

  const header = content.split(/\r\n|\r|\n/, 5).join('\n');
  return /(@generated|auto-generated|automatically generated)/i.test(header);
}

function countPhysicalLines(content) {
  if (content.length === 0) return 0;
  const lines = content.split(/\r\n|\r|\n/);
  if (lines.at(-1) === '') lines.pop();
  return lines.length;
}

function normalizePath(filePath) {
  return filePath.split(path.sep).join('/');
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

findings.sort((left, right) => left.localeCompare(right));

if (findings.length > 0) {
  findings.forEach((finding) => console.error(finding));
  process.exit(1);
}

console.log(`File size audit passed. Limit: ${FILE_LINE_LIMIT} lines.`);
