// `needs_verbatim` by code, over a point's state and hindsight. Pure.
import type { AutocompactState } from '#src/recap/application/autocompact-state.ts';
import { agentTextOf } from './hindsight.ts';
import type { Hindsight } from './hindsight.ts';
import { verbatimLabel } from './verbatim.ts';

/** 1 when material found only in `recent_turns` (not in the goal or the open work) shows up in the agent's next turns. */
export function crossCheck(point: { readonly state: AutocompactState; readonly hindsight: Hindsight }): 0 | 1 {
    const recent = point.state.recent_turns.map((turn) => turn.text).join('\n');
    const own = [point.state.goal ?? '', ...point.state.open_work.map((item) => item.text)].join('\n');
    return verbatimLabel(recent, own, agentTextOf(point.hindsight));
}
