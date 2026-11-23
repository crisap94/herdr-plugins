import { must } from '#src/protocol/result.ts';
import type { PaneNote } from '#src/ports/extension.ts';
import type { CompactionRow } from '#src/ports/compaction-records.ts';
import type { ExpandedData } from '#src/recap/application/expanded-view.ts';
import type { Count } from '#src/recap/domain/count.ts';
import type { GuiLocale } from '#src/recap/domain/gui-tab-parts.ts';
import type { PaneId } from '#src/recap/domain/ids.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import type { WorktreeStatus } from '#src/recap/domain/worktree.ts';

export interface GuiReads {
    readonly expanded: ExpandedData | null;
    readonly notes: (pane: PaneId) => readonly PaneNote[];
    readonly warnings: readonly Text[];
    readonly compactions: readonly CompactionRow[];
    readonly compactHint: Count | null;
    readonly locale: GuiLocale;
    readonly zone: Text;
    readonly plugin: Text | null;
    readonly git: (pane: PaneId) => WorktreeStatus | null;
}

export const BLANK_READS: GuiReads = {
    expanded: null,
    notes: (): readonly PaneNote[] => [],
    warnings: [],
    compactions: [],
    compactHint: null,
    locale: 'en',
    zone: must(parseText('UTC')),
    plugin: null,
    git: (): null => null,
};
