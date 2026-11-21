import { humanText, parseMessage, parsePart } from '@stateforge-labs/harness-adapters/opencode';
import type { OpenCodeMessage, OpenCodePart } from '@stateforge-labs/harness-adapters/opencode';
import type { OpenCodeStore, StoredMessage } from '@stateforge-labs/harness-adapters/opencode/store';
import type { AgentNote, Entry, Mark } from '#src/ports/transcripts.ts';
import { parseInstant } from '@stateforge-labs/session-ledger/unstable/recap/domain/time.ts';
import type { Instant } from '@stateforge-labs/session-ledger/unstable/recap/domain/time.ts';
import { opencodeObserved } from './context.ts';
import { namedCall, toolEntry } from '../tool-calls.ts';

type PartRole = 'user' | 'assistant';

function partEntry(role: PartRole, part: OpenCodePart, at: Instant | undefined): Entry | null {
    const when = at === undefined ? {} : { at };
    const text = humanText(part);
    if (text !== null) {
        return { role: role === 'user' ? 'user' : 'agent', text, ...when };
    }
    return part.partType === 'tool' ? toolEntry(namedCall('opencode', part.tool ?? 'tool', part.input), at) : null;
}

function markOf(message: OpenCodeMessage): Mark {
    const [created, completed] = [message.createdAt, message.completedAt];
    const tokens = opencodeObserved({ ...message, role: 'assistant' })?.tokens;
    return { kind: 'compacted', at: created, ...(tokens === undefined ? {} : { tokensBefore: tokens }), ...(created === null || completed === null || completed < created ? {} : { tookMs: completed - created }) };
}

export interface Parts { readonly entries: readonly Entry[]; readonly notes: readonly AgentNote[]; readonly marks: readonly Mark[] }

export function partsOf(store: Pick<OpenCodeStore, 'partsOf'>, message: StoredMessage): Parts {
    const parsed = parseMessage(message.data);
    const info = parsed.ok ? parsed.record : null;
    const role = info?.role === 'user' ? 'user' : 'assistant';
    const entries = store.partsOf(message.id).flatMap((raw) => {
        const part = parsePart(raw);
        if (!part.ok) {
            return [];
        }
        const started = parseInstant(part.record.startedAt ?? info?.createdAt);
        const entry = partEntry(role, part.record, started.kind === 'ok' ? started.value : undefined);
        return entry === null ? [] : [entry];
    });
    if (info === null || !info.isCompaction) {
        return { entries, notes: [], marks: [] };
    }
    const text = entries.filter((entry) => entry.role === 'agent').map((entry) => entry.text).join('\n').trim();
    return { entries: [], notes: text === '' ? [] : [{ kind: 'compaction', at: info.createdAt, text }], marks: text === '' ? [] : [markOf(info)] };
}
