import type { GuardedLedger, GuardedRecapRecords } from '#src/ports/guarded-reads.ts';
import type { HandoffPrintService } from '#src/ports/handoff-print.ts';
import type { LegacyStories as Stories } from '@stateforge-labs/session-ledger';
import type { TabViewStore } from '#src/ports/tab-views.ts';
import { compactPreviewOf, type CompactPreview } from '#src/recap/application/compact-preview.ts';
import { handoffMessageOf, type HandoffRead } from '#src/recap/application/handoff-message.ts';
import { AnsweredByHand, type NeedAnswer } from '#src/recap/application/need-answer.ts';
import type { SessionKey, ScopeId } from '#src/recap/domain/ids.ts';
import type { NonEmptyText, Text } from '@stateforge-labs/session-ledger';
import type { Instant } from '@stateforge-labs/session-ledger';

export interface EngineParts {
    readonly ledger: Pick<GuardedLedger, 'keysOf' | 'allOf'>;
    readonly stories: Pick<Stories, 'keep'>;
    readonly records: Pick<GuardedRecapRecords, 'readRecap'>;
    readonly views: Pick<TabViewStore, 'readTab' | 'tabOf'>;
    readonly printer: HandoffPrintService;
    readonly now: () => Instant;
    readonly republish: (tab: ScopeId) => void;
}

export class DesktopEngine {
    private readonly parts: EngineParts;
    private readonly answers: AnsweredByHand;

    constructor(parts: EngineParts) {
        this.parts = parts;
        this.answers = new AnsweredByHand({ ledger: parts.ledger, stories: parts.stories, now: parts.now });
    }

    answer(tab: ScopeId, id: NonEmptyText): NeedAnswer {
        const answered = this.answers.answer(tab, id);
        if (answered.kind === 'answered') { this.parts.republish(tab); }
        return answered;
    }

    compactMessage(tab: ScopeId, pane: SessionKey, note: Text): CompactPreview {
        return compactPreviewOf(this.parts, tab, pane, note);
    }

    handoffMessage(tab: ScopeId, from: SessionKey, to: SessionKey | null): Promise<HandoffRead> {
        return handoffMessageOf(this.parts, tab, from, to);
    }
}
