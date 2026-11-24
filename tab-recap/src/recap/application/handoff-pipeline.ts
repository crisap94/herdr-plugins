import type { Text } from '@stateforge-labs/session-ledger';
import { byteBudgetOf } from '#src/recap/domain/byte-budget.ts';
import { isUnknown, saying } from '@stateforge-labs/session-ledger';
import type { PaneTokens } from '#src/ports/pane-tokens.ts';
import type { HandoffReference } from '#src/recap/render/handoff-markdown.ts';
import { omittedTotal } from '#src/recap/render/handoff-markdown.ts';
import { freshnessTextOf } from '#src/recap/render/freshness.ts';
import { worksiteTextOf } from '#src/recap/render/worksite.ts';
import { must } from '@stateforge-labs/session-ledger';
import { parseText } from '@stateforge-labs/session-ledger';
import { instant } from '@stateforge-labs/session-ledger';
import { buildHandoffContent } from './handoff-content.ts';
import { closedFreshnessOf, freshnessOf } from './freshness-block.ts';
import type { FreshnessDeps } from './freshness-block.ts';
import { HANDOFF_WORKSITE_BYTES } from './handoff-limits.ts';
import type { HandoffLane, HandoffRender, HandoffRenderInput, HandoffRenderResult } from './handoff-render.ts';
import { handoffTextOf } from './handoff-text.ts';
import type { HandoffLog } from './handoff-mirror.ts';
import { worksiteOf } from './worksite-section.ts';
import type { WorksiteDeps } from './worksite-section.ts';
import { countOf } from '@stateforge-labs/session-ledger';
import type { FsPath } from '#src/recap/domain/fs-path.ts';

export interface HandoffPipelineDeps {
    readonly records: FreshnessDeps['records'];
    readonly transcripts: FreshnessDeps['transcripts'];
    readonly log: HandoffLog;
    readonly locate: (lane: HandoffLane) => Promise<FsPath | null>;
    readonly worksite: WorksiteDeps;
    readonly tokens: PaneTokens;
}

const referenceOf = (input: HandoffRenderInput): HandoffReference => (input.handoff === null ? { kind: 'dry-run' } : { kind: 'handoff', id: input.handoff, at: instant(input.at) });

async function tokensOf(tokens: PaneTokens, lane: HandoffLane): Promise<ReadonlyMap<Text, Text> | null> {
    const found = await tokens.read(lane.pane);
    return isUnknown(found) ? null : found.tokens;
}

export function renderHandoff(deps: HandoffPipelineDeps): HandoffRender {
    return async (input: HandoffRenderInput): Promise<HandoffRenderResult> => {
        const { lane, cursor, closed } = input;
        const freshness = closed === undefined
            ? await freshnessOf({ records: deps.records, transcripts: deps.transcripts, unreported: (failure) => deps.log(must(parseText(`handoff ${String(lane.tab)}: ledger unreadable, ${saying(failure.why)}`))) }, { tab: lane.tab, agent: lane.agent, source: await deps.locate(lane), cursor, status: lane.status, refresh: input.refresh })
            : closedFreshnessOf(closed);
        if (freshness.kind === 'ledger-empty') {
            return { kind: 'refused', reason: 'ledger-empty' };
        }
        if (freshness.kind === 'ledger-unreadable') {
            return { kind: 'failed', reason: 'source-unreadable' };
        }
        const worksite = await worksiteOf(deps.worksite, { directory: lane.cwd, cursor, tokens: closed === undefined ? await tokensOf(deps.tokens, lane) : null });
        const body = buildHandoffContent({
            at: instant(input.at),
            task: { open: input.facts.filter((fact) => fact.state === 'open'), closed: input.facts.filter((fact) => fact.state === 'closed') },
            freshness: freshness.freshness,
            worksite,
            note: input.note === null ? null : must(parseText(input.note)),
        });
        if (body.kind === 'refused') {
            return { kind: 'refused', reason: body.reason };
        }
        const fitted = handoffTextOf(body, {
            reference: referenceOf(input),
            freshnessText: freshnessTextOf(freshness.freshness, closed === undefined ? null : closed.closedAt),
            worksiteText: worksiteTextOf(worksite, byteBudgetOf(countOf(HANDOFF_WORKSITE_BYTES))),
        });
        if (fitted.kind === 'too-large') {
            return { kind: 'refused', reason: 'too-large' };
        }
        return { kind: 'text', text: fitted.text, bytes: countOf(new TextEncoder().encode(fitted.text).byteLength), omitted: omittedTotal(fitted.omitted), withheld: fitted.omitted.withheld };
    };
}
