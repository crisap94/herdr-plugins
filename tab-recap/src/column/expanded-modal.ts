// What the modal draws: the expanded view of its tab, from the store. Composition for the column process; no model call.
import type { Store } from '#src/adapters/db/database.ts';
import { ClaudeTranscripts } from '#src/adapters/claude-transcripts.ts';
import { CodexTranscripts } from '#src/adapters/codex-transcripts.ts';
import { OpencodeTranscripts } from '#src/adapters/opencode-transcripts.ts';
import { EditCache, EditCounts } from '#src/recap/application/edit-counts.ts';
import type { FileCount } from '#src/recap/application/edit-counts.ts';
import { ExpandedModel } from '#src/recap/application/expanded-view.ts';
import { expanded } from '#src/recap/render/expanded.ts';
import type { ColumnView } from '#src/recap/render/present.ts';
import { coloured, wrap } from '#src/recap/render/wrap.ts';

/** The expanded view as lines for `width` cells; `store` is null when the database is newer than the plugin (only its warning is drawn). */
export function expandedScreen(store: Store | null): (view: ColumnView, width: number) => readonly string[] {
    const edits = new EditCache(new EditCounts([new ClaudeTranscripts(), new CodexTranscripts(), new OpencodeTranscripts()]));
    const model = store === null ? null : new ExpandedModel({ records: store.records, ledger: store.ledger, stories: store.stories, session: store.session, autocompact: store.autocompact, boundaries: store.boundaries, requests: store.requests, edits: (lanes, now): readonly FileCount[] => edits.of(lanes, now) });
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return (view, width) => {
        const style = view.style ?? coloured;
        const warnings = view.warnings.flatMap((warning) => [...wrap(warning, width).map(style.red), '']);
        if (model === null || view.tab === null || view.tab.lanes.length === 0) {
            return [...warnings, ...wrap(view.messages.waitingForAgent, width).map(style.gray)];
        }
        const data = model.read(view.tab.tab, view.tab, view.now);
        return [...warnings, ...expanded({ ...data, width, messages: view.messages, style, now: view.now, zone })];
    };
}
