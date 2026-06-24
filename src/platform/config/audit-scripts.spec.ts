import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const repoRoot = path.resolve(__dirname, '../../..');

describe('release audit scripts', () => {
  it('fails file-size audit on an oversized service fixture', () => {
    const fixtureRoot = createFixtureRoot('audit-file-size');
    writeFileSync(
      path.join(fixtureRoot, 'src/huge.service.ts'),
      Array.from(
        { length: 351 },
        (_, index) => `export const line${index} = ${index};`,
      ).join('\n'),
    );

    expect(() => runAudit('scripts/audit-file-size.mjs', fixtureRoot)).toThrow(
      /service exceeds 350 lines/,
    );
  });

  it('fails architecture audit on forbidden process.env usage', () => {
    const fixtureRoot = createFixtureRoot('audit-architecture');
    mkdirSync(path.join(fixtureRoot, 'src/modules/demo'), { recursive: true });
    writeFileSync(
      path.join(fixtureRoot, 'src/modules/demo/demo.service.ts'),
      ['export const leaked = ', 'process', '.env.SECRET_VALUE;\n'].join(''),
    );

    expect(() =>
      runAudit('scripts/audit-architecture.mjs', fixtureRoot),
    ).toThrow(/direct process\.env access is forbidden/);
  });

  it('fails secrets audit on a fake private key fixture', () => {
    const fixtureRoot = createFixtureRoot('audit-secrets');
    writeFileSync(
      path.join(fixtureRoot, 'src/leak.ts'),
      [
        'const fake = `',
        '-----BEGIN ',
        'PRIVATE KEY-----\\n',
        'TEST\\n',
        '-----END ',
        'PRIVATE KEY-----`;',
        '',
      ].join(''),
    );

    expect(() => runAudit('scripts/audit-secrets.mjs', fixtureRoot)).toThrow(
      /matched secret pattern/,
    );
  });
});

function createFixtureRoot(prefix: string): string {
  const root = mkdtempSync(path.join(tmpdir(), `${prefix}-`));
  mkdirSync(path.join(root, 'src'), { recursive: true });
  mkdirSync(path.join(root, 'test'), { recursive: true });
  mkdirSync(path.join(root, 'scripts'), { recursive: true });
  return root;
}

function runAudit(scriptRelativePath: string, cwd: string): string {
  return execFileSync('node', [path.join(repoRoot, scriptRelativePath)], {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
  });
}
