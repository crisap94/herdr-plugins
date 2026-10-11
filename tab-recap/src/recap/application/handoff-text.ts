import { byteBudgetOf } from '#src/recap/domain/byte-budget.ts';
import type { HandoffBody } from '#src/recap/domain/handoff-content.ts';
import type { FittedHandoff } from '#src/recap/render/handoff-budget.ts';
import { fitHandoff } from '#src/recap/render/handoff-budget.ts';
import type { FreshnessBlock } from '#src/recap/render/freshness.ts';
import type { HandoffReference } from '#src/recap/render/handoff-markdown.ts';
import type { WorksiteBlock } from '#src/recap/render/worksite.ts';
import { HANDOFF_BUDGET_BYTES } from './handoff-limits.ts';

export interface RenderedBlocks {
    readonly reference: HandoffReference;
    readonly freshnessText: FreshnessBlock;
    readonly worksiteText: WorksiteBlock | null;
}

export function handoffTextOf(body: HandoffBody, blocks: RenderedBlocks): FittedHandoff {
    return fitHandoff(
        { reference: blocks.reference, note: body.note, freshnessText: blocks.freshnessText, worksiteText: blocks.worksiteText, groups: body.groups, withheld: body.withheld },
        byteBudgetOf(HANDOFF_BUDGET_BYTES),
    );
}
