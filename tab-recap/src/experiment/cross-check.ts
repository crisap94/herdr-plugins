import type { AutocompactState } from '#src/recap/application/autocompact-state.ts';
import { agentTextOf } from './hindsight.ts';
import type { Hindsight } from './hindsight.ts';
import { verbatimLabel } from './verbatim.ts';

export function crossCheck(point: { readonly state: AutocompactState; readonly hindsight: Hindsight }): 0 | 1 {
    const recent = point.state.recent_turns.map((turn) => turn.text).join('\n');
    const own = [point.state.goal ?? '', ...point.state.open_work.map((item) => item.text)].join('\n');
    return verbatimLabel(recent, own, agentTextOf(point.hindsight));
}
