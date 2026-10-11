import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FactId } from '#src/recap/domain/fact.ts';
import type { HandoffEntry } from '#src/recap/domain/handoff-content.ts';
import { isForbidden } from '#src/recap/domain/handoff-vetting.ts';
import type { HandoffParts } from '#src/recap/render/handoff-markdown.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SANITIZER = 'src/recap/domain/handoff-sanitize.ts';
const SCANNED = ['bin', 'ci', 'docs', 'src', 'test'];
const CASTS = [/\bas\s+HandoffText\b/u, /Brand<string,\s*'HandoffText'>/u];

const typeScriptFilesUnder = (dir: string): readonly string[] =>
    readdirSync(join(ROOT, dir), { recursive: true, encoding: 'utf8' })
        .filter((file) => file.endsWith('.ts'))
        .map((file) => join(dir, file));

test('only the sanitizer module makes the HandoffText brand', () => {
    const casting = SCANNED.flatMap(typeScriptFilesUnder).filter((file) => CASTS.some((pattern) => pattern.test(readFileSync(join(ROOT, file), 'utf8'))));
    assert.deepEqual(casting, [SANITIZER]);
});

const rawEntry = (text: string): HandoffEntry => ({
    id: 'x' as FactId,
    firstAt: 0,
    lastAt: 0,
    // @ts-expect-error
    text,
    reason: null,
});

const rawParts = (note: string): HandoffParts => ({
    reference: { kind: 'dry-run' },
    // @ts-expect-error
    note,
    freshnessText: '',
    worksiteText: null,
    groups: [],
    omitted: { done: 0, links: 0, closed: 0, now: 0, next: 0, withheld: 0 },
});

const rawForbidden = (raw: string): boolean =>
    // @ts-expect-error
    isForbidden(raw);

test('raw text is not accepted where sanitized text is required', () => {
    assert.equal(rawEntry('plain').text, 'plain');
    assert.equal(rawParts('plain').note, 'plain');
    assert.equal(rawForbidden('plugin'), true);
});
