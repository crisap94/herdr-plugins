import type { DeciderState } from '@stateforge-labs/session-ledger';
import { must } from '@stateforge-labs/session-ledger';
import { parseCount, type Count } from '@stateforge-labs/session-ledger';
import type { Probability } from '@stateforge-labs/session-ledger';
import { parseText, type Text } from '@stateforge-labs/session-ledger';
import { crossCheck } from './cross-check.ts';
import type { Hindsight } from './hindsight.ts';
import { questionScore, type Labels, type ScoredReps } from './report-metrics.ts';
import type { Label } from './stats.ts';


export interface CodedMoment { readonly id: Text; readonly state: DeciderState; readonly hindsight: Hindsight }

export interface CodeAgreement { readonly positives: Count; readonly auc: Probability | null; readonly brier: Probability | null }

export function codeAgreement(points: readonly CodedMoment[], reps: ScoredReps): CodeAgreement {
    const question = must(parseText('needs_verbatim'));
    const labels: Labels = new Map(points.map((point) => [point.id, new Map<Text, Label>([[question, crossCheck(point)]])]));
    const { auc, brier } = questionScore(reps, question, labels, (key) => (key.includes('#') ? 'drop' : 'keep'));
    return { positives: must(parseCount([...labels.values()].filter((label) => label.get(question) === 1).length)), auc, brier };
}
