import type { Store } from '#src/adapters/db/database.ts';
import { must } from '#src/protocol/result.ts';
import { modalTranscriptRegistry } from '#src/adapters/transcripts/registry.ts';
import { EditCache, EditCounts } from '#src/recap/application/edit-counts.ts';
import { ExpandedModel } from '#src/recap/application/expanded-view.ts';
import { expanded } from '#src/recap/render/expanded.ts';
import type { ColumnView } from '#src/recap/render/present.ts';
import { parseText } from '#src/recap/domain/text.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { coloured, wrap } from '#src/recap/render/wrap.ts';

export function expandedScreen(store: Store | null): (view: ColumnView, width: number) => readonly Text[] {
    const edits = new EditCache(new EditCounts(modalTranscriptRegistry()));
    const model = store === null ? null : new ExpandedModel({ records: store.records, ledger: store.ledger, stories: store.stories, session: store.session, autocompact: store.autocompact, boundaries: store.boundaries, requests: store.requests, edits: edits.of.bind(edits) });
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return (view, width) => {
        const style = view.style ?? coloured;
        const warnings = view.warnings.flatMap((warning) => [...wrap(warning, width).map(style.red), '']);
        if (model === null || view.tab === null || view.tab.lanes.length === 0) {
            return [...warnings, ...wrap(view.messages.waitingForAgent, width).map(style.gray)].map((line) => must(parseText(line)));
        }
        const data = model.read(view.tab.tab, view.tab, view.now);
        return [...warnings, ...expanded({ ...data, width, messages: view.messages, style, now: view.now, zone })].map((line) => must(parseText(line)));
    };
}
