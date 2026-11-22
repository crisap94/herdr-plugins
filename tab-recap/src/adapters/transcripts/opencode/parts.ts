import { humanText, parseMessage, parsePart } from '@stateforge-labs/harness-adapters/opencode';
import type { OpenCodeMessage, OpenCodePart } from '@stateforge-labs/harness-adapters/opencode';
import type { OpenCodeStore, StoredMessage } from '@stateforge-labs/harness-adapters/opencode/store';
import type { AgentNote, Entry, Mark } from '#src/ports/transcripts.ts';
import { parseInstant } from '@stateforge-labs/session-ledger/unstable/recap/domain/time.ts';
import type { Instant } from '@stateforge-labs/session-ledger/unstable/recap/domain/time.ts';
import { opencodeObserved } from './context.ts';
import { namedCallOf, toolEntryOf } from '../tool-calls.ts';
import { textOf } from '#src/recap/domain/text.ts';
import { countOf } from '#src/recap/domain/count.ts';
import { instant, duration } from '#src/recap/domain/time.ts';

type PartRole = 'user' | 'assistant';

const createdOf = (message: OpenCodeMessage): Instant | null => (message.createdAt === null ? null : instant(message.createdAt));

function partEntry(role: PartRole, part: OpenCodePart, at: Instant | undefined): Entry | null {
    const when = at === undefined ? {} : { at };
    const text = humanText(part);
    if (text !== null) {
        return { role: role === 'user' ? 'user' : 'agent', text: textOf(text), ...when };
    }
    return part.partType === 'tool' ? toolEntryOf(namedCallOf('opencode', textOf(part.tool ?? 'tool'), part.input), at ?? null) : null;
}

function markOf(message: OpenCodeMessage): Mark {
    const [created, completed] = [message.createdAt, message.completedAt];
    const tokens = opencodeObserved({ ...message, role: 'assistant' })?.tokens;
    return { kind: 'compacted', at: createdOf(message), ...(tokens === undefined ? {} : { tokensBefore: countOf(tokens) }), ...(created === null || completed === null || completed < created ? {} : { tookMs: duration(completed - created) }) };
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
    return { entries: [], notes: text === '' ? [] : [{ kind: 'compaction', at: createdOf(info), text: textOf(text) }], marks: text === '' ? [] : [markOf(info)] };
}
