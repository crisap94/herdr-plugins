import type { AskLedger } from '#src/ports/ask-ledger.ts';
import type { LaneTokens } from '#src/ports/lane-tokens.ts';
import type { Requests } from '#src/ports/requests.ts';
import type { TokenMap } from '#src/protocol/tokens.ts';
import { parseWireText, type WireText } from '#src/protocol/primitives.ts';
import type { Board } from '#src/recap/domain/board.ts';

export interface CompactRequestDeps {
    readonly enabled: () => boolean;
    readonly board: () => Board;
    readonly requests: Pick<Requests, 'requestCompact'>;
    readonly asks: AskLedger;
    readonly tokens: LaneTokens;
    readonly now: () => number;
    readonly log: (line: string) => void;
}

export const wireMap = (tokens: TokenMap): ReadonlyMap<WireText, WireText> => {
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
