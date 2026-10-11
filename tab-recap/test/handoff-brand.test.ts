import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FactId } from '#src/recap/domain/fact.ts';
import type { HandoffEntry } from '#src/recap/domain/handoff-content.ts';
import { isForbidden } from '#src/recap/domain/handoff-vetting.ts';
import type { HandoffFit } from '#src/recap/render/handoff-budget.ts';
import { freshnessTextOf } from '#src/recap/render/freshness.ts';
import type { HandoffParts } from '#src/recap/render/handoff-markdown.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SCANNED = ['bin', 'ci', 'docs', 'src', 'test'];
const BRAND_MODULES = {
    HandoffText: 'src/recap/domain/handoff-sanitize.ts',
    FreshnessBlock: 'src/recap/render/freshness.ts',
    WorksiteBlock: 'src/recap/render/worksite.ts',
} as const;

type BrandName = keyof typeof BRAND_MODULES;

const typeScriptFilesUnder = (dir: string): readonly string[] =>
    readdirSync(join(ROOT, dir), { recursive: true, encoding: 'utf8' })
        .filter((file) => file.endsWith('.ts'))
        .map((file) => join(dir, file));

const castsOf = (brand: BrandName): readonly RegExp[] => [new RegExp(`\\bas\\s+${brand}\\b`, 'u'), new RegExp(`Brand<string,\\s*'${brand}'>`, 'u')];

for (const brand of Object.keys(BRAND_MODULES) as BrandName[]) {
    test(`only the ${brand} module makes the ${brand} brand`, () => {
        const casting = SCANNED.flatMap(typeScriptFilesUnder).filter((file) => {
            const source = readFileSync(join(ROOT, file), 'utf8');
            return castsOf(brand).some((pattern) => pattern.test(source));
        });
        assert.deepEqual(casting, [BRAND_MODULES[brand]]);
    });
}

const rawEntry = (text: string, reason: string): HandoffEntry => ({
    id: 'x' as FactId,
    firstAt: 0,
    lastAt: 0,
    // @ts-expect-error
    text,
    // @ts-expect-error
    reason,
});

const rawParts = (note: string, freshness: string, worksite: string): HandoffParts => ({
    reference: { kind: 'dry-run' },
    // @ts-expect-error
    note,
    // @ts-expect-error
    freshnessText: freshness,
    // @ts-expect-error
    worksiteText: worksite,
    groups: [],
    omitted: { done: 0, links: 0, closed: 0, now: 0, next: 0, withheld: 0 },
});

const rawFit = (note: string): HandoffFit => ({
    reference: { kind: 'dry-run' },
    // @ts-expect-error
    note,
    freshnessText: freshnessTextOf({ lastRun: { at: 0, cause: 'imported' }, status: 'idle', newerPrompts: { kind: 'none' }, refresh: 'not-requested' }),
    worksiteText: null,
    groups: [],
    withheld: 0,
});

const rawForbidden = (raw: string): boolean =>
    // @ts-expect-error
    isForbidden(raw);

test('raw text is not accepted where sanitized text or a renderer block is required', () => {
    assert.equal(rawEntry('plain', 'why').text, 'plain');
    assert.equal(rawEntry('plain', 'why').reason, 'why');
    assert.equal(rawFit('plain').note, 'plain');
    assert.equal(rawParts('plain', 'last run', 'worksite').note, 'plain');
    assert.equal(rawParts('plain', 'last run', 'worksite').freshnessText, 'last run');
    assert.equal(rawParts('plain', 'last run', 'worksite').worksiteText, 'worksite');
    assert.equal(rawForbidden('plugin'), true);
});
