import { knownOr, type GuardedLedger } from '#src/ports/guarded-reads.ts';
import type { Stories } from '#src/ports/stories.ts';
import { unknown, type Unknown, exitCodeOf } from '#src/ports/unknowable.ts';
import { must } from '#src/protocol/result.ts';
import type { Fact } from '#src/recap/domain/fact.ts';
import { causeOf } from '#src/recap/domain/failure-cause.ts';
import type { ScopeId } from '#src/recap/domain/ids.ts';
import type { CloseOp } from '#src/recap/domain/ops.ts';
import { parseText, type NonEmptyText, textOf } from '#src/recap/domain/text.ts';
import type { Instant } from '#src/recap/domain/time.ts';

export type NeedRefusal = 'unknown-need' | 'not-a-need' | 'not-open';

export type NeedAnswer =
    | { readonly kind: 'answered'; readonly id: NonEmptyText }
    | { readonly kind: 'refused'; readonly reason: NeedRefusal }
    | Unknown;

export interface NeedAnswerDeps {
    readonly ledger: Pick<GuardedLedger, 'keysOf' | 'allOf'>;
    readonly stories: Pick<Stories, 'keep'>;
    readonly now: () => Instant;
}

const refused = (reason: NeedRefusal): NeedAnswer => ({ kind: 'refused', reason });

function factOf(ledger: NeedAnswerDeps['ledger'], tab: ScopeId, id: NonEmptyText): Fact | null {
    for (const key of knownOr(ledger.keysOf(tab), [])) {
        const found = knownOr(ledger.allOf({ scope: tab, key }), []).find((fact) => String(fact.id) === id);
        if (found !== undefined) { return found; }
    }
    return null;
}

const refusalOf = (fact: Fact | null): NeedRefusal | null => {
    if (fact === null) { return 'unknown-need'; }
    if (fact.section !== 'needs') { return 'not-a-need'; }
    return fact.state === 'open' ? null : 'not-open';
};

export class AnsweredByHand {
    private readonly deps: NeedAnswerDeps;

    constructor(deps: NeedAnswerDeps) {
        this.deps = deps;
    }

    answer(tab: ScopeId, id: NonEmptyText): NeedAnswer {
        const fact = factOf(this.deps.ledger, tab, id);
        const refusal = refusalOf(fact);
        if (fact === null || refusal !== null) { return refused(refusal ?? 'unknown-need'); }
        const close: CloseOp = { op: 'close', id: fact.id, why: 'answered' };
        try {
            const applied = this.deps.stories.keep({ task: fact.task, at: this.deps.now(), language: textOf(fact.language) }, { story: null, merges: [close] });
            const turned = applied.refused[0];
            if (turned === undefined) { return { kind: 'answered', id }; }
            return turned.reason === 'closed' ? refused('not-open') : unknown({ why: 'failed', code: exitCodeOf(1), detail: causeOf(must(parseText(`the ledger refused the close: ${turned.reason}`))) });
        } catch (failure) {
            return unknown({ why: 'unreadable', detail: causeOf(must(parseText(failure instanceof Error ? failure.message : String(failure)))) });
        }
    }
}
