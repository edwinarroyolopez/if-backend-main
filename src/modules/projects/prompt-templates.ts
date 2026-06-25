import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function loadBackendPromptTemplate(fileName: string) {
  const candidates = [
    join(process.cwd(), 'prompts', fileName),
    join(process.cwd(), 'dist', 'prompts', fileName),
    join(__dirname, '..', '..', 'prompts', fileName),
    join(__dirname, '..', '..', '..', 'prompts', fileName),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, 'utf8');
    }
  }

  throw new Error(`Backend prompt template not found: ${fileName}`);
}
