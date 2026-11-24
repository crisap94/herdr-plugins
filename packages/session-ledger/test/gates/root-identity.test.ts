import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import * as root from '../../src/index.ts';

const SRC = join(dirname(new URL(import.meta.url).pathname), '..', '..', 'src');
const LINE = /^export \{([^}]*)\} from '(\.\/[^']+)';$/gmu;

interface Reexport {
    readonly module: string;
    readonly name: string;
    readonly as: string;
}

function reexports(): readonly Reexport[] {
    return [...readFileSync(join(SRC, 'index.ts'), 'utf8').matchAll(LINE)].flatMap(([, body = '', module = '']) =>
        body
            .split(',')
            .map((piece) => piece.trim())
            .filter((piece) => piece !== '' && !piece.startsWith('type '))
            .map((piece) => {
                const [name = '', alias = name] = piece.split(/\s+as\s+/u);
                return { module, name, as: alias };
            }));
}

const rootValue = (name: string): unknown => Reflect.get(root, name);

test('every value the root re-exports by name is the very value of its source module', async () => {
    const listed = reexports();
    assert.ok(listed.length > 300);
    const different: string[] = [];
    for (const { module, name, as } of listed) {
        const source: unknown = await import(join(SRC, module));
        if (rootValue(as) !== Reflect.get(Object(source), name)) {
            different.push(`${as} from ${module}`);
        }
    }
    assert.deepEqual(different, []);
});

test('the five names of the recap shape and the compaction hints are the values of their modules', async () => {
    const shape: unknown = await import(join(SRC, 'recap/application/recap-shape.ts'));
    const compaction: unknown = await import(join(SRC, 'recap/domain/compaction.ts'));
    assert.equal(root.renderRecap, Reflect.get(Object(shape), 'renderRecap'));
    assert.equal(root.headlineOf, Reflect.get(Object(shape), 'headlineOf'));
    assert.equal(root.hintFor, Reflect.get(Object(compaction), 'hintFor'));
    assert.equal(root.sizeOf, Reflect.get(Object(compaction), 'sizeOf'));
    assert.equal(root.tokensOf, Reflect.get(Object(compaction), 'tokensOf'));
});

test('the names two modules declare with different meanings each have their own root name', () => {
    assert.notEqual(root.tokensOf, root.wordTokensOf);
    assert.notEqual(root.jaccard, root.wordJaccard);
    assert.notEqual(root.quotedIn, root.anchorQuotedIn);
});
