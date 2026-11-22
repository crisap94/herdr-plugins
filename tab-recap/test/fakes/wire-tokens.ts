import { parseWireText, type RequestId, type WireText } from '#src/protocol/primitives.ts';
import { must } from '#src/protocol/result.ts';
import { parseAskId } from '#src/recap/domain/compact-request.ts';
import type { TokenMap } from '#src/protocol/tokens.ts';

export const wireOf = (tokens: TokenMap): ReadonlyMap<WireText, WireText> => {
    const wire = new Map<WireText, WireText>();
    for (const [name, raw] of Object.entries(tokens)) {
        const key = parseWireText(name);
        const value = parseWireText(raw);
        if (key.kind === 'ok' && value.kind === 'ok') {
            wire.set(key.value, value.value);
        }
    }
    return wire;
};

export const askOf = (raw: string): RequestId => {
    const id = parseAskId(raw);
    if (id === null) {
        throw new RangeError(`not an ask id: ${raw}`);
    }
    return id;
};

export const stageOf = (raw: string): WireText => must(parseWireText(raw));
