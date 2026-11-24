import { uncheckedTypeId, type TypeId } from '#src/recap/domain/type-id.ts';
import { textOf, type Text } from '@stateforge-labs/session-ledger';

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

export const PREFIXES = { transcript: 'tscr', chapter: 'chap', boundary: 'bnd', task: 'task', run: 'run', request: 'req', handoff: 'hnd', compaction: 'cmp', verdict: 'vrd', fact: 'fct', decision: 'dcn' } as const;

export type Entity = keyof typeof PREFIXES;

export function encodeSuffix(id: Uint8Array): Text {
    let value = id.reduce((all, byte) => (all << 8n) | BigInt(byte), 0n);
    let text = '';
    for (let at = 0; at < 26; at += 1) {
        text = `${ALPHABET[Number(value & 31n)] ?? '0'}${text}`;
        value >>= 5n;
    }
    return textOf(text);
}

export function decodeSuffix(text: Text): Uint8Array | null {
    if (text.length !== 26) {
        return null;
    }
    let value = 0n;
    for (const character of text) {
        const digit = ALPHABET.indexOf(character);
        if (digit < 0) {
            return null;
        }
        value = (value << 5n) | BigInt(digit);
    }
    if (value >> 128n !== 0n) {
        return null;
    }
    return Uint8Array.from({ length: 16 }, (_, at) => Number((value >> BigInt(8 * (15 - at))) & 255n));
}

export const typeIdOf = (entity: Entity, id: Uint8Array): TypeId => uncheckedTypeId(`${PREFIXES[entity]}_${encodeSuffix(id)}`);

export function idOf(entity: Entity, typeId: TypeId): Uint8Array | null {
    const prefix = `${PREFIXES[entity]}_`;
    return typeId.startsWith(prefix) ? decodeSuffix(textOf(typeId.slice(prefix.length))) : null;
}
