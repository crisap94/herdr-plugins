import { must } from '@stateforge-labs/session-ledger';
import { parseCount, type Count } from '@stateforge-labs/session-ledger';
import { parseText, type Text } from '@stateforge-labs/session-ledger';

export type GlowSpawn = (args: readonly Text[], input: Text) => Promise<Text | null>;
export type GlowLines = readonly Text[];

export interface GlowCache {
    render(text: Text, width: Count): GlowLines | null;
    onReady(listener: () => void): () => void;
}

const DEFAULT_LIMIT: Count = must(parseCount(256));
const MIN_WIDTH: Count = must(parseCount(20));
const STYLE: readonly Text[] = [must(parseText('-s')), must(parseText('dark')), must(parseText('-w'))];
const STDIN: Text = must(parseText('-'));
const TRAILING_NEWLINES = /\n+$/;

const keyOf = (text: Text, width: Count): Text => must(parseText(JSON.stringify([text, width])));

const argsFor = (width: Count): readonly Text[] => [...STYLE, must(parseText(String(Math.max(MIN_WIDTH, width)))), STDIN];

export function glowCache(spawn: GlowSpawn, limit: Count = DEFAULT_LIMIT): GlowCache {
    const ready = new Map<Text, GlowLines>();
    const running = new Set<Text>();
    const listeners = new Set<() => void>();

    const store = (key: Text, lines: GlowLines): void => {
        ready.delete(key);
        ready.set(key, lines);
        for (const oldest of ready.keys()) {
            if (ready.size <= limit) {
                break;
            }
            ready.delete(oldest);
        }
    };

    const finish = (key: Text, output: Text | null): void => {
        running.delete(key);
        if (output === null) {
            return;
        }
        store(key, output.replace(TRAILING_NEWLINES, '').split('\n').map((line) => must(parseText(line))));
        for (const listener of listeners) {
            listener();
        }
    };

    const begin = (key: Text, text: Text, width: Count): void => {
        spawn(argsFor(width), text).then(
            (output) => finish(key, output),
            () => finish(key, null),
        );
    };

    return {
        render(text, width) {
            const key = keyOf(text, width);
            const lines = ready.get(key);
            if (lines !== undefined) {
                store(key, lines);
                return lines;
            }
            if (!running.has(key)) {
                running.add(key);
                begin(key, text, width);
            }
            return null;
        },
        onReady(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    };
}
