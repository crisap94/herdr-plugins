import { gunzipSync, gzipSync } from 'node:zlib';
import { parseCheckedFact, type CheckedFact } from '@stateforge-labs/session-ledger';
import { parseFactIndex, type FactIndex } from '#src/recap/domain/fact-index.ts';
import { parseText, type Text } from '@stateforge-labs/session-ledger';
import { isRow } from './rows.ts';

export interface CheckedBriefRecord {
    readonly brief: Text;
    readonly appended: readonly FactIndex[];
    readonly checked: readonly CheckedFact[];
}

export function encode(value: CheckedBriefRecord): Uint8Array {
    return gzipSync(JSON.stringify(value));
}

export function parseCheckedBriefRecord(input: unknown): CheckedBriefRecord {
    if (!isRow(input)) throw new Error('checked brief is not an object');
    const [brief, appended, checked] = [parseText(input['brief']), input['appended'], input['checked']];
    if (brief.kind === 'err' || !Array.isArray(appended) || !Array.isArray(checked)) throw new Error('checked brief has invalid fields');
    const indexes = appended.map((item): FactIndex => {
        const index = parseFactIndex(item);
        if (index.kind === 'err') throw new Error('checked brief has invalid fields');
        return index.value;
    });
    return {
        brief: brief.value, appended: indexes, checked: checked.map((item): CheckedFact => {
            if (typeof item !== 'object' || item === null) throw new Error('checked fact is not an object');
            const fact = parseCheckedFact(item);
            if (fact === null) throw new Error('checked fact has invalid fields');
            return fact;
        }),
    };
}

export function decode(value: Uint8Array): CheckedBriefRecord {
    const raw: unknown = JSON.parse(gunzipSync(value).toString('utf8'));
    return parseCheckedBriefRecord(raw);
}
