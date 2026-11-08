import { mock } from 'bun:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const KIT = join(HERE, 'kit.ts');
const HERDR = join(HERE, 'herdr.ts');
const FAKES = new Map<string, string>([['gpui-kit', KIT], ['gpui-base', KIT], ['herdr', HERDR]]);

for (const [name, absolutePath] of FAKES) {
    mock.module(name, async () => import(absolutePath));
}
