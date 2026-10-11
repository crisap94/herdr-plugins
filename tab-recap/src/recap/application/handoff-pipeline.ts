import { byteBudgetOf } from '#src/recap/domain/byte-budget.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import type { PaneTokens } from '#src/ports/pane-tokens.ts';
import type { HandoffReference } from '#src/recap/render/handoff-markdown.ts';
import { omittedTotal } from '#src/recap/render/handoff-markdown.ts';
import { freshnessTextOf } from '#src/recap/render/freshness.ts';
import { worksiteTextOf } from '#src/recap/render/worksite.ts';
import { buildHandoffContent } from './handoff-content.ts';
import { closedFreshnessOf, freshnessOf } from './freshness-block.ts';
import type { FreshnessDeps } from './freshness-block.ts';
import { HANDOFF_WORKSITE_BYTES } from './handoff-limits.ts';
import type { HandoffLane, HandoffRender, HandoffRenderInput, HandoffRenderResult } from './handoff-render.ts';
import { handoffTextOf } from './handoff-text.ts';
import { worksiteOf } from './worksite-section.ts';
import type { WorksiteDeps } from './worksite-section.ts';

export interface HandoffPipelineDeps {
    readonly records: FreshnessDeps['records'];
    readonly transcripts: FreshnessDeps['transcripts'];
    readonly locate: (lane: HandoffLane) => Promise<string | null>;
    readonly worksite: WorksiteDeps;
    readonly tokens: PaneTokens;
}

const referenceOf = (input: HandoffRenderInput): HandoffReference => (input.handoff === null ? { kind: 'dry-run' } : { kind: 'handoff', id: input.handoff, at: input.at });

async function tokensOf(tokens: PaneTokens, lane: HandoffLane): Promise<Readonly<Record<string, string>> | null> {
    const found = await tokens.read(String(lane.pane));
    return isUnknown(found) ? null : found.tokens;
}

export function renderHandoff(deps: HandoffPipelineDeps): HandoffRender {
    return async (input: HandoffRenderInput): Promise<HandoffRenderResult> => {
        const { lane, cursor, closed } = input;
        const freshness = closed === undefined
            ? await freshnessOf({ records: deps.records, transcripts: deps.transcripts }, { tab: String(lane.tab), agent: String(lane.agent), source: await deps.locate(lane), cursor, status: lane.status, refresh: input.refresh })
            : closedFreshnessOf(closed);
        if (freshness.kind === 'ledger-empty') {
            return { kind: 'refused', reason: 'ledger-empty' };
        }
        const worksite = await worksiteOf(deps.worksite, { directory: lane.cwd, cursor, tokens: closed === undefined ? await tokensOf(deps.tokens, lane) : null });
        const body = buildHandoffContent({
            at: input.at,
            task: { open: input.facts.filter((fact) => fact.state === 'open'), closed: input.facts.filter((fact) => fact.state === 'closed') },
            freshness: freshness.freshness,
            worksite,
            note: input.note,
        });
        if (body.kind === 'refused') {
            return { kind: 'refused', reason: body.reason };
        }
        const fitted = handoffTextOf(body, {
            reference: referenceOf(input),
            freshnessText: freshnessTextOf(freshness.freshness, closed === undefined ? null : closed.closedAt),
            worksiteText: worksiteTextOf(worksite, byteBudgetOf(HANDOFF_WORKSITE_BYTES)),
        });
        if (fitted.kind === 'too-large') {
            return { kind: 'refused', reason: 'too-large' };
        }
        return { kind: 'text', text: fitted.text, bytes: new TextEncoder().encode(fitted.text).byteLength, omitted: omittedTotal(fitted.omitted), withheld: fitted.omitted.withheld };
    };
}
