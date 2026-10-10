import { readPaneTokens } from '#src/adapters/herdr-fleet.ts';
import type { Extension, ExtensionFactory, Note, NotesResult } from '#src/ports/extension.ts';
import type { PaneTokens } from '#src/ports/pane-tokens.ts';
import type { TabLane } from '#src/ports/tab-views.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import { notesOf } from '#src/recap/domain/coordination.ts';
import { backoffMs } from '#src/recap/domain/backoff.ts';

export const TTL_MS = 3000;
const FORGET_MS = 60_000;

interface Entry {
    readonly tokens: Readonly<Record<string, string>>;
    readonly at: number;
    seen: number;
}

export interface TokenNotesDeps {
    readonly panes: PaneTokens;
    readonly now: () => number;
}

export class TokenNotes implements Extension {
    readonly id = 'herdr-notes';
    private readonly deps: TokenNotesDeps;
    private readonly cache = new Map<string, Entry>();
    private readonly reading = new Set<string>();
    private readonly failing = new Map<string, { readonly count: number; readonly until: number }>();

    constructor(deps: TokenNotesDeps) {
        this.deps = deps;
    }

    notes(lanes?: readonly TabLane[]): NotesResult {
        const now = this.deps.now();
        const byPane = new Map<string, readonly Note[]>();
        for (const lane of lanes ?? []) {
            const entry = this.look(lane.pane, now);
            const found = entry === undefined ? [] : notesOf(entry.tokens).map((note): Note => ({ label: note.label, at: null, details: [note.value] }));
            if (found.length > 0) {
                byPane.set(lane.pane, found);
            }
        }
        this.forget(now);
        return { kind: 'notes', byPane };
    }

    private look(pane: string, now: number): Entry | undefined {
        const entry = this.cache.get(pane);
        if (entry !== undefined) {
            entry.seen = now;
        }
        if ((entry === undefined || now - entry.at >= TTL_MS) && !this.reading.has(pane) && (this.failing.get(pane)?.until ?? 0) <= now) {
            this.reading.add(pane);
            void this.read(pane);
        }
        return entry;
    }

    private async read(pane: string): Promise<void> {
        try {
            const found = await this.deps.panes.read(pane);
            const now = this.deps.now();
            if (isUnknown(found)) {
                const count = (this.failing.get(pane)?.count ?? 0) + 1;
                this.failing.set(pane, { count, until: now + backoffMs(count) });
            } else {
                this.failing.delete(pane);
                this.cache.set(pane, { tokens: found.tokens, at: now, seen: now });
            }
        } finally {
            this.reading.delete(pane);
        }
    }

    private forget(now: number): void {
        for (const [pane, entry] of this.cache) {
            if (now - entry.seen > FORGET_MS) {
                this.cache.delete(pane);
            }
        }
    }
}

export const tokenNotes: ExtensionFactory = () => new TokenNotes({ panes: { read: readPaneTokens }, now: () => Date.now() });
