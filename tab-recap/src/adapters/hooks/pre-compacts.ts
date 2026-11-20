import type { SessionId } from '#src/recap/domain/ids.ts';
import type { Instant } from '#src/recap/domain/time.ts';

export interface PreCompacts {
    mark(session: SessionId, at: Instant): void;
    markedAt(session: SessionId): Instant | null;
    restored(session: SessionId, at: Instant): void;
    servedSinceMark(session: SessionId): Instant | null;
}

export function createPreCompacts(): PreCompacts {
    const marked = new Map<SessionId, Instant>();
    const restored = new Map<SessionId, Instant>();

    return {
        mark: (session, at): void => {
            marked.set(session, at);
        },
        markedAt: (session): Instant | null => marked.get(session) ?? null,
        restored: (session, at): void => {
            restored.set(session, at);
        },
        servedSinceMark: (session): Instant | null => {
            const served = restored.get(session);
            if (served === undefined) {
                return null;
            }
            const mark = marked.get(session);
            return mark === undefined || served >= mark ? served : null;
        },
    };
}
