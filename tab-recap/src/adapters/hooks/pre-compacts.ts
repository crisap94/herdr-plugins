import type { SessionId } from '#src/recap/domain/ids.ts';
import type { Instant } from '#src/recap/domain/time.ts';

export interface PreCompacts {
    mark(session: SessionId, at: Instant): void;
    markedAt(session: SessionId): Instant | null;
}

export function createPreCompacts(): PreCompacts {
    const marked = new Map<SessionId, Instant>();

    return {
        mark: (session, at): void => {
            marked.set(session, at);
        },
        markedAt: (session): Instant | null => marked.get(session) ?? null,
    };
}
