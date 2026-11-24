import type { Store } from '#src/adapters/db/database.ts';
import { must } from '@stateforge-labs/session-ledger';
import { modalTranscriptRegistry } from '#src/adapters/transcripts/registry.ts';
import { EditCache, EditTally } from '#src/recap/application/edit-tally.ts';
import { ExpandedModel } from '#src/recap/application/expanded-view.ts';
import { expanded } from '#src/view-model/expanded.ts';
import type { ColumnView } from '#src/view-model/present.ts';
import { parseText } from '@stateforge-labs/session-ledger';
import type { Text } from '@stateforge-labs/session-ledger';
import { coloured, wrap } from '@stateforge-labs/recap-view/unstable/wrap.ts';
import { instant } from '@stateforge-labs/session-ledger';

export function expandedScreen(store: Store | null): (view: ColumnView, width: number) => readonly Text[] {
    const edits = new EditCache(new EditTally(modalTranscriptRegistry()));
    const model = store === null ? null : new ExpandedModel({ records: store.records, ledger: store.ledger, stories: store.stories, session: store.session, autocompact: store.decisions, boundaries: store.boundaries, requests: store.requests, edits: edits.of.bind(edits) });
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return (view, width) => {
        const style = view.style ?? coloured;
        const warnings = view.warnings.flatMap((warning) => [...wrap(warning, width).map(style.red), '']);
        if (model === null || view.tab === null || view.tab.lanes.length === 0) {
            return [...warnings, ...wrap(view.messages.waitingForAgent, width).map(style.gray)].map((line) => must(parseText(line)));
        }
        const data = model.read(view.tab.tab, view.tab, instant(view.now));
        return [...warnings, ...expanded({ ...data, width, messages: view.messages, style, now: view.now, zone })].map((line) => must(parseText(line)));
    };
}
