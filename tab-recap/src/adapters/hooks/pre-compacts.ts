import type { SessionId } from '#src/recap/domain/ids.ts';
import type { Instant } from '@stateforge-labs/session-ledger';
import type { Text } from '@stateforge-labs/session-ledger';

export type HookRestore = { readonly kind: 'offered'; readonly text: Text } | { readonly kind: 'typed' } | { readonly kind: 'none' };

export interface PreCompacts {
    mark(session: SessionId, at: Instant): void;
    markedAt(session: SessionId): Instant | null;
    offer(session: SessionId, text: Text): void;
    take(session: SessionId): Text | null;
    served(session: SessionId): HookRestore;
}

type Held = Exclude<HookRestore, { kind: 'none' }>;

export function createPreCompacts(): PreCompacts {
    const marked = new Map<SessionId, Instant>();
    const held = new Map<SessionId, Held>();

    return {
        mark: (session, at): void => {
            marked.set(session, at);
            if (held.get(session)?.kind === 'typed') {
                held.delete(session);
            }
        },
        markedAt: (session): Instant | null => marked.get(session) ?? null,
        offer: (session, text): void => {
            held.set(session, { kind: 'offered', text });
        },
        take: (session): Text | null => {
            const offered = held.get(session);
            if (offered?.kind !== 'offered') {
                return null;
            }
            held.set(session, { kind: 'typed' });
            return offered.text;
        },
        served: (session): HookRestore => {
            const state = held.get(session);
            held.delete(session);
            return state ?? { kind: 'none' };
        },
    };
}
