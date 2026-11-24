import type { DeciderState } from '@stateforge-labs/session-ledger';
import { must } from '@stateforge-labs/session-ledger';
import { parseText } from '@stateforge-labs/session-ledger';
import { agentTextOf } from './hindsight.ts';
import type { Hindsight } from './hindsight.ts';
import { verbatimLabel } from './verbatim.ts';

interface CrossCheckPoint { readonly state: DeciderState; readonly hindsight: Hindsight }

type CrossCheckLabel = 0 | 1;

export function crossCheck(point: CrossCheckPoint): CrossCheckLabel {
    const recent = must(parseText(point.state.recent_turns.map((turn) => turn.text).join('\n')));
    const own = must(parseText([point.state.goal ?? '', ...point.state.open_work.map((item) => item.text)].join('\n')));
    return verbatimLabel(recent, own, agentTextOf(point.hindsight));
}
