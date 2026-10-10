import { gunzipSync, gzipSync } from 'node:zlib';
import { isSection } from '#src/recap/domain/fact.ts';
import type { CheckedFact } from '#src/recap/domain/autocompact.ts';

export interface CheckedBriefRecord {
    readonly brief: string;
    readonly appended: readonly number[];
    readonly checked: readonly CheckedFact[];
}

export function encode(value: CheckedBriefRecord): Uint8Array {
    return gzipSync(JSON.stringify(value));
}

export function decode(value: Uint8Array): CheckedBriefRecord {
    const raw: unknown = JSON.parse(gunzipSync(value).toString('utf8'));
    if (typeof raw !== 'object' || raw === null) throw new Error('checked brief is not an object');
    const record = raw as Record<string, unknown>;
    if (typeof record['brief'] !== 'string' || !Array.isArray(record['appended']) || !record['appended'].every((item) => Number.isInteger(item) && item >= 0) || !Array.isArray(record['checked'])) throw new Error('checked brief has invalid fields');
    const checked = record['checked'].map((item): CheckedFact => {
        if (typeof item !== 'object' || item === null) throw new Error('checked fact is not an object');
        const fact = item as Record<string, unknown>;
        if (!isSection(fact['section']) || typeof fact['text'] !== 'string' || !(fact['why'] === null || typeof fact['why'] === 'string')) throw new Error('checked fact has invalid fields');
        return { section: fact['section'], text: fact['text'], why: fact['why'] };
    });
    return { brief: record['brief'], appended: record['appended'], checked };
}
