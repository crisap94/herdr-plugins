// TypeID-style ids at the edge: `<prefix>_<26 chars>`, the 26 being the 128 bits in Crockford base32 (lowercase), so the text
// sorts the way the bytes (and the creation times) do. The prefix is not stored: the table implies it. A wrong prefix, length
// or alphabet decodes to `Unknown` (null) — never to some other row's id.

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

/** The tables whose ids are UUIDs, and what their TypeIDs start with. */
export const PREFIXES = { transcript: 'tscr', chapter: 'chap', boundary: 'bnd', task: 'task', run: 'run', request: 'req', compaction: 'cmp' } as const;

export type Entity = keyof typeof PREFIXES;

/** The 26 characters: 130 bits, the first two of them zero, so the first character is at most `7`. */
export function encodeSuffix(id: Uint8Array): string {
    let value = id.reduce((all, byte) => (all << 8n) | BigInt(byte), 0n);
    let text = '';
    for (let at = 0; at < 26; at += 1) {
        text = `${ALPHABET[Number(value & 31n)] ?? '0'}${text}`;
        value >>= 5n;
    }
    return text;
}

export function decodeSuffix(text: string): Uint8Array | null {
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

export const typeIdOf = (entity: Entity, id: Uint8Array): string => `${PREFIXES[entity]}_${encodeSuffix(id)}`;

/** The id's bytes, or null when the text is not a TypeID of that entity. */
export function idOf(entity: Entity, typeId: string): Uint8Array | null {
    const prefix = `${PREFIXES[entity]}_`;
    return typeId.startsWith(prefix) ? decodeSuffix(typeId.slice(prefix.length)) : null;
}
