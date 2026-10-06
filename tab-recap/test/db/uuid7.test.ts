import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareIds, timeOf, Uuid7Generator } from '#src/adapters/db/uuid7.ts';

const fixed = (ms: number, fill = 0xab): ConstructorParameters<typeof Uuid7Generator>[0] => ({ now: (): number => ms, random: (bytes): void => { bytes.fill(fill); } });

test('uuid7: version 7, variant 10, and the millisecond round-trips', () => {
    const id = new Uuid7Generator(fixed(1_791_167_014_726)).next();
    assert.equal(id.length, 16);
    assert.equal((id[6] ?? 0) >> 4, 7);
    assert.equal((id[8] ?? 0) >> 6, 0b10);
    assert.equal(timeOf(id), 1_791_167_014_726);
});

test('uuid7: strictly increasing over 10 000 ids made in the same millisecond; the counter overflowing bumps the millisecond', () => {
    const generator = new Uuid7Generator({ now: (): number => 5_000, random: (bytes): void => { crypto.getRandomValues(bytes); } });
    const made = Array.from({ length: 10_000 }, () => generator.next());
    made.slice(1).forEach((id, at) => { assert.ok(compareIds(made[at] ?? id, id) < 0, `id ${at + 1} is above id ${at}`); });
    assert.ok(timeOf(made.at(-1) ?? new Uint8Array(6)) > 5_000, 'more than 4096 ids in one millisecond moved the stamp forward');
});

test('uuid7: a clock that goes back does not make an id smaller', () => {
    let ms = 9_000;
    const generator = new Uuid7Generator({ now: (): number => ms, random: (bytes): void => { crypto.getRandomValues(bytes); } });
    const first = generator.next();
    ms = 8_000;
    assert.ok(compareIds(first, generator.next()) < 0);
});

test('uuid7: a later millisecond is above an earlier one whatever the random bits say', () => {
    let ms = 1;
    const generator = new Uuid7Generator({ now: (): number => ms, random: (bytes): void => { bytes.fill(0xff); } });
    const earlier = generator.next();
    ms = 2;
    assert.ok(compareIds(earlier, generator.next()) < 0);
});

test('uuid7: two generators (two processes) never collide', () => {
    const [a, b] = [new Uuid7Generator(), new Uuid7Generator()];
    const seen = new Set<string>();
    for (let at = 0; at < 2_000; at += 1) {
        seen.add(Buffer.from(a.next()).toString('hex'));
        seen.add(Buffer.from(b.next()).toString('hex'));
    }
    assert.equal(seen.size, 4_000);
});
