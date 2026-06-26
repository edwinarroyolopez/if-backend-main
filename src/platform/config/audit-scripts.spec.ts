import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const repoRoot = path.resolve(__dirname, '../../..');

describe('release audit scripts', () => {
  it('passes file-size audit on a 300-line file', () => {
    const fixtureRoot = createFixtureRoot('audit-file-size-pass');
    writeFileSync(
      path.join(fixtureRoot, 'src/exactly-300.service.ts'),
      createLines(300),
    );

    expect(runAudit('scripts/audit-file-size.mjs', fixtureRoot)).toContain(
      'Limit: 300 lines',
    );
  });

  it('fails file-size audit on a 301-line file', () => {
    const fixtureRoot = createFixtureRoot('audit-file-size-fail');
    writeFileSync(path.join(fixtureRoot, 'src/huge.ts'), createLines(301));

    expect(() => runAudit('scripts/audit-file-size.mjs', fixtureRoot)).toThrow(
      /src\/huge\.ts :: 301 lines exceeds limit 300/,
    );
  });

  it('fails file-size audit for oversized services, controllers, tests and scripts', () => {
    const fixtureRoot = createFixtureRoot('audit-file-size-kinds');
    writeFileSync(
      path.join(fixtureRoot, 'src/huge.service.ts'),
      createLines(301),
    );
    writeFileSync(
      path.join(fixtureRoot, 'src/huge.controller.ts'),
      createLines(301),
    );
    writeFileSync(
      path.join(fixtureRoot, 'test/huge.e2e-spec.ts'),
      createLines(301),
    );
    writeFileSync(path.join(fixtureRoot, 'scripts/huge.mjs'), createLines(301));

    expect(() => runAudit('scripts/audit-file-size.mjs', fixtureRoot)).toThrow(
      /scripts\/huge\.mjs :: 301 lines exceeds limit 300[\s\S]*src\/huge\.controller\.ts :: 301 lines exceeds limit 300[\s\S]*src\/huge\.service\.ts :: 301 lines exceeds limit 300[\s\S]*test\/huge\.e2e-spec\.ts :: 301 lines exceeds limit 300/,
    );
  });

  it('ignores legitimate generated files and lockfiles in file-size audit', () => {
    const fixtureRoot = createFixtureRoot('audit-file-size-ignore');
    mkdirSync(path.join(fixtureRoot, 'src/generated'), { recursive: true });
    writeFileSync(
      path.join(fixtureRoot, 'src/generated/client.ts'),
      createLines(500),
    );
    writeFileSync(
      path.join(fixtureRoot, 'src/model.generated.ts'),
      createLines(500),
    );
    writeFileSync(path.join(fixtureRoot, 'yarn.lock'), createLines(500));

    expect(runAudit('scripts/audit-file-size.mjs', fixtureRoot)).toContain(
      'File size audit passed',
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

  it('fails architecture audit on product service inheritance', () => {
    const fixtureRoot = createFixtureRoot('audit-architecture-inheritance');
    writeFileSync(
      path.join(fixtureRoot, 'src/demo.service.ts'),
      'class ParentService {}\nexport class DemoService extends ParentService {}\n',
    );

    expect(() =>
      runAudit('scripts/audit-architecture.mjs', fixtureRoot),
    ).toThrow(/composition, not service inheritance/);
  });

  it('fails architecture audit on storage placeholder URLs', () => {
    const fixtureRoot = createFixtureRoot('audit-architecture-placeholder');
    writeFileSync(
      path.join(fixtureRoot, 'src/storage.service.ts'),
      "export const url = 'https://res.cloudinary.com/inflight-placeholder/image/upload/x';\n",
    );

    expect(() =>
      runAudit('scripts/audit-architecture.mjs', fixtureRoot),
    ).toThrow(/storage placeholder URLs are forbidden/);
  });

  it('fails architecture audit on controller external adapter usage', () => {
    const fixtureRoot = createFixtureRoot('audit-architecture-controller');
    writeFileSync(
      path.join(fixtureRoot, 'src/demo.controller.ts'),
      'export class DemoController { constructor(private readonly client: IfConnectorsRuntimeClient) {} }\n',
    );

    expect(() =>
      runAudit('scripts/audit-architecture.mjs', fixtureRoot),
    ).toThrow(/controllers must not call external adapters directly/);
  });

  it('fails architecture audit on unchecked external casts', () => {
    const fixtureRoot = createFixtureRoot('audit-architecture-cast');
    writeFileSync(
      path.join(fixtureRoot, 'src/demo.client.ts'),
      'type RemoteResponse = { ok: boolean };\nexport const parse = (payload: unknown) => payload as RemoteResponse;\n',
    );

    expect(() =>
      runAudit('scripts/audit-architecture.mjs', fixtureRoot),
    ).toThrow(/validate runtime payloads/);
  });

  it('allows architecture audit on composed services and validated clients', () => {
    const fixtureRoot = createFixtureRoot('audit-architecture-pass');
    writeFileSync(
      path.join(fixtureRoot, 'src/demo.service.ts'),
      'export class DemoService { constructor(private readonly dependency: object) {} }\n',
    );
    writeFileSync(
      path.join(fixtureRoot, 'src/demo.client.ts'),
      'export const parse = (payload: unknown): unknown => payload;\n',
    );

    expect(runAudit('scripts/audit-architecture.mjs', fixtureRoot)).toContain(
      'Architecture audit passed',
    );
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

function createLines(count: number): string {
  return Array.from(
    { length: count },
    (_, index) => `export const line${index} = ${index};`,
  ).join('\n');
}
