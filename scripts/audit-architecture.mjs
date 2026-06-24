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
    if (isForbiddenProcessEnvUsage(relative, content)) {
      findings.push(
        `${relative} :: direct process.env access is forbidden outside config/test env helper`,
      );
    }
    if (hasCrossModuleSchemaImport(relative, content)) {
      findings.push(`${relative} :: cross-module schema imports are not allowed`);
    }
    if (hasPlatformSchemaImport(relative, content)) {
      findings.push(`${relative} :: platform schemas must remain private to their owner`);
    }
    if (hasHardcodedRoleComparison(content)) {
      findings.push(`${relative} :: hardcoded role-name checks are not allowed`);
    }
  }
}

function isForbiddenProcessEnvUsage(relative, content) {
  if (!/\.ts$/.test(relative)) {
    return false;
  }
  if (relative === 'src/platform/config/app-config.ts') {
    return false;
  }
  if (relative === 'test/mongo-replset.ts') {
    return false;
  }
  if (relative.endsWith('audit-scripts.spec.ts')) {
    return false;
  }

  return /process\.env/.test(content);
}

function hasCrossModuleSchemaImport(relative, content) {
  if (!relative.startsWith('src/')) {
    return false;
  }

  const owner = getModuleOwner(relative);
  if (!owner) {
    return false;
  }

  const schemaImports = [...content.matchAll(/from\s+['"](src\/[^'"]+\.schema)['"]/g)];
  return schemaImports.some((match) => getModuleOwner(match[1]) !== owner);
}

function hasPlatformSchemaImport(relative, content) {
  if (!relative.startsWith('src/modules/')) {
    return false;
  }

  return /from\s+['"]src\/platform\/[^'"]+\.schema['"]/.test(content);
}

function hasHardcodedRoleComparison(content) {
  return /(roleKey|role|principalRole)\s*(===|!==)\s*['"][A-Z_]+['"]/.test(content);
}

function getModuleOwner(relativePath) {
  const parts = relativePath.split(path.sep).join('/').split('/');
  if (parts[0] !== 'src') {
    return null;
  }

  if (parts[1] === 'modules' && parts.length >= 3) {
    return `modules/${parts[2]}`;
  }

  if (parts[1] === 'platform' && parts.length >= 3) {
    return `platform/${parts[2]}`;
  }

  return null;
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
