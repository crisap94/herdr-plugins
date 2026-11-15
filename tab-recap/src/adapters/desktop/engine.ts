import type { HandoffPrinter } from '#src/ports/handoff-print.ts';
import type { Ledger } from '#src/ports/ledger.ts';
import type { RecapRecords } from '#src/ports/recap-records.ts';
import type { Stories } from '#src/ports/stories.ts';
import type { TabViews } from '#src/ports/tab-views.ts';
import { compactPreviewOf, type CompactPreview } from '#src/recap/application/compact-preview.ts';
import { handoffMessageOf, type HandoffRead } from '#src/recap/application/handoff-message.ts';
import { AnsweredByHand, type NeedAnswer } from '#src/recap/application/need-answer.ts';
import type { PaneId, TabId } from '#src/recap/domain/ids.ts';
import type { NonEmptyText, Text } from '#src/recap/domain/text.ts';
import type { Instant } from '#src/recap/domain/time.ts';

export interface EngineParts {
    readonly ledger: Pick<Ledger, 'keysOf' | 'allOf'>;
    readonly stories: Pick<Stories, 'keep'>;
    readonly records: Pick<RecapRecords, 'readRecap'>;
    readonly views: Pick<TabViews, 'readTab' | 'tabOf'>;
    readonly printer: HandoffPrinter;
    readonly now: () => Instant;
    readonly republish: (tab: TabId) => void;
}

export class DesktopEngine {
    private readonly parts: EngineParts;
    private readonly answers: AnsweredByHand;

    constructor(parts: EngineParts) {
        this.parts = parts;
        this.answers = new AnsweredByHand({ ledger: parts.ledger, stories: parts.stories, now: parts.now });
    }

    answer(tab: TabId, id: NonEmptyText): NeedAnswer {
        const answered = this.answers.answer(tab, id);
        if (answered.kind === 'answered') { this.parts.republish(tab); }
        return answered;
    }

    compactMessage(tab: TabId, pane: PaneId, note: Text): CompactPreview {
        return compactPreviewOf(this.parts, tab, pane, note);
    }

    handoffMessage(tab: TabId, from: PaneId, to: PaneId | null): Promise<HandoffRead> {
        return handoffMessageOf(this.parts, tab, from, to);
    }
}
