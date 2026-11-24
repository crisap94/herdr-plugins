import type { ArmName } from '#src/adapters/experiment/arms.ts';
import { must } from '@stateforge-labs/session-ledger';
import type { Probability } from '@stateforge-labs/session-ledger';
import { parseText, type Text } from '@stateforge-labs/session-ledger';


export const WITHIN_POINTS = 0.03;
export const MAX_DRIFT = 0.15;

export type HarnessNeed = 'recap-only' | 'other';

export interface ArmRating { readonly arm: Text; readonly precision: Probability | null; readonly drift: Probability | null; readonly coverageAuc: Probability | null; readonly harness: HarnessNeed }

export interface Choice { readonly defaultArm: Text | null; readonly coverageArm: Text | null; readonly why: Text }

interface Rated { readonly arm: Text; readonly precision: Probability; readonly drift: Probability | null; readonly harness: HarnessNeed }

function whyOf(harness: Rated | undefined, other: Rated | undefined, best: Probability | null): Text {
    if (harness !== undefined) return must(parseText(`${harness.arm}: a recap-writer harness within ${WITHIN_POINTS * 100} points of the best precision (${(best ?? Number.NEGATIVE_INFINITY).toFixed(3)}) with drift ${(harness.drift ?? Number.NaN).toFixed(3)} ≤ ${MAX_DRIFT}`));
    if (other === undefined) return must(parseText('no arm has drift within the limit: the default stays `recap`'));
    return must(parseText(`${other.arm}: no recap-writer harness is within ${WITHIN_POINTS * 100} points of the best precision with drift ≤ ${MAX_DRIFT}`));
}

const closest = (list: readonly Rated[]): Rated | undefined => list.reduce<Rated | undefined>((top, arm) => (top === undefined || arm.precision > top.precision ? arm : top), undefined);

export function choose(arms: readonly ArmRating[]): Choice {
    const rated = arms.flatMap((arm): Rated[] => (arm.precision === null ? [] : [{ arm: arm.arm, precision: arm.precision, drift: arm.drift, harness: arm.harness }]));
    const best = closest(rated)?.precision ?? null;
    const steady = rated.filter((arm) => arm.drift !== null && arm.drift <= MAX_DRIFT);
    const harness = closest(steady.filter((arm) => arm.harness === 'recap-only' && best !== null && arm.precision >= best - WITHIN_POINTS));
    const other = harness === undefined ? closest(steady) : undefined;
    const coverage = arms.reduce<ArmRating | undefined>((top, arm) => (arm.coverageAuc !== null && (top?.coverageAuc === undefined || top.coverageAuc === null || arm.coverageAuc > top.coverageAuc) ? arm : top), undefined);
    return { defaultArm: harness?.arm ?? other?.arm ?? null, coverageArm: coverage?.arm ?? null, why: whyOf(harness, other, best) };
}

export type { ArmName };
