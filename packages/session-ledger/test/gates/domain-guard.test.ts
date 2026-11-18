import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mock, test } from 'node:test';
import type { Git } from '../../gates/bin/domain-baseline.ts';
import { runGuard } from '../../gates/bin/domain-report.ts';

const BASE = 'merge-base';

interface Snapshot {
    readonly own: Readonly<Record<string, unknown>>;
    readonly inherited: Readonly<Record<string, unknown>>;
    readonly head: Readonly<Record<string, unknown>>;
    readonly moves?: string;
    readonly split?: boolean;
}

interface Outcome {
    readonly status: number;
    readonly lines: readonly string[];
}

const fakeGit = (snapshot: Snapshot): Git => (args) => {
    const [command, ...rest] = args;
    const target = rest.at(-1) ?? '';
    if (command === 'ls-tree') {
        if (target.endsWith('domain-types-baseline.json')) {
            return `${target}\n`;
        }
        if (snapshot.split === true && target.endsWith('domain-types-baseline')) {
            return `${target}/recap.json\n`;
        }
        return target.endsWith('inherited') ? `${target}/B2.json\n` : '';
    }
    if (command === 'show') {
        return JSON.stringify(target.endsWith('B2.json') ? snapshot.inherited : snapshot.own);
    }
    return '';
};

const guarded = (snapshot: Snapshot): Outcome => {
    const root = mkdtempSync(join(tmpdir(), 'domain-guard-'));
    const lines: string[] = [];
    const keep = (line: unknown): void => {
        lines.push(String(line).trim());
    };
    const error = mock.method(console, 'error', keep);
    const log = mock.method(console, 'log', keep);
    try {
        mkdirSync(join(root, 'gates', 'domain-types-baseline'), { recursive: true });
        mkdirSync(join(root, 'inherited'));
        writeFileSync(join(root, 'gates', 'config.json'), JSON.stringify({ inheritBaseline: 'inherited' }));
        writeFileSync(join(root, 'gates', 'domain-types-baseline', 'recap.json'), JSON.stringify(snapshot.head));
        if (snapshot.moves !== undefined) {
            writeFileSync(join(root, 'gates', 'domain-types-moves.tsv'), snapshot.moves);
        }
        const status = runGuard(root, ['--baseline', join(root, 'gates', 'domain-types-baseline'), '--guard', BASE], fakeGit(snapshot));
        return { status, lines };
    } finally {
        error.mock.restore();
        log.mock.restore();
        rmSync(root, { recursive: true, force: true });
    }
};

const OWN = { 'src/contract.ts': { property: 1 } };

test('a row inherited from the plugin baseline at the merge base that does not rise passes', () => {
    const outcome = guarded({ own: OWN, inherited: { 'src/recap/domain/lane.ts': { property: 9 } }, head: { ...OWN, 'src/recap/domain/lane.ts': { property: 9 } } });
    assert.equal(outcome.status, 0, outcome.lines.join('\n'));
    assert.ok(outcome.lines.includes('domain baseline: no entry rose and none is new'));
});

test('an inherited row that rises fails', () => {
    const outcome = guarded({ own: OWN, inherited: { 'src/recap/domain/lane.ts': { property: 9 } }, head: { 'src/recap/domain/lane.ts': { property: 10 } } });
    assert.equal(outcome.status, 1);
    assert.ok(outcome.lines.includes('raised: src/recap/domain/lane.ts: property 9 -> 10'), outcome.lines.join('\n'));
});

test('a row in neither the package nor the inherited baseline at the merge base fails as new', () => {
    const outcome = guarded({ own: OWN, inherited: { 'src/recap/domain/lane.ts': { property: 9 } }, head: { 'src/recap/domain/fresh.ts': { property: 1 } } });
    assert.equal(outcome.status, 1);
    assert.ok(outcome.lines.includes('new entry: src/recap/domain/fresh.ts: property 1'), outcome.lines.join('\n'));
});

test('the package row wins over the inherited row for the same file', () => {
    const outcome = guarded({ own: { 'src/contract.ts': { property: 1 } }, inherited: { 'src/contract.ts': { property: 5 } }, head: { 'src/contract.ts': { property: 2 } } });
    assert.equal(outcome.status, 1);
    assert.ok(outcome.lines.includes('raised: src/contract.ts: property 1 -> 2'), outcome.lines.join('\n'));
});

test('a moved file is compared with the inherited row of the file it moved from', () => {
    const outcome = guarded({
        own: OWN,
        inherited: { 'src/recap/domain/lane.ts': { property: 9 } },
        head: { 'src/recap/domain/lane-shape.ts': { property: 1 } },
        moves: 'src/recap/domain/lane-shape.ts\tsrc/recap/domain/lane.ts\n',
    });
    assert.equal(outcome.status, 0, outcome.lines.join('\n'));
});

test('a new legacy row passes while its baseline file total falls, and fails once the total rises', () => {
    const own = { 'src/recap/domain/fact.ts': { property: 3 } };
    const fell = guarded({ own, inherited: {}, split: true, head: { 'src/recap/domain/legacy.ts': { legacy: 2 } } });
    assert.equal(fell.status, 0, fell.lines.join('\n'));
    const rose = guarded({ own, inherited: {}, split: true, head: { 'src/recap/domain/legacy.ts': { legacy: 4 } } });
    assert.equal(rose.status, 1);
    assert.ok(rose.lines.includes('baseline total rose: recap.json: 3 -> 4'), rose.lines.join('\n'));
});
