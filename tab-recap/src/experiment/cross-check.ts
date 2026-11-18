import type { AutocompactState } from '#src/recap/application/autocompact-state.ts';
import { must } from '#src/protocol/result.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { agentTextOf } from './hindsight.ts';
import type { Hindsight } from './hindsight.ts';
import { verbatimLabel } from './verbatim.ts';

interface CrossCheckPoint { readonly state: AutocompactState; readonly hindsight: Hindsight }

type CrossCheckLabel = 0 | 1;

export function crossCheck(point: CrossCheckPoint): CrossCheckLabel {
    const recent = must(parseText(point.state.recent_turns.map((turn) => turn.text).join('\n')));
    const own = must(parseText([point.state.goal ?? '', ...point.state.open_work.map((item) => item.text)].join('\n')));
    return verbatimLabel(recent, own, agentTextOf(point.hindsight));
}
