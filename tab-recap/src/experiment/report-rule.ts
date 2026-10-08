// The pre-registered rule of design decision 9, applied to the numbers. Pure.
import type { ArmName } from '#src/adapters/experiment-arms.ts';

export const WITHIN_POINTS = 0.03;
export const MAX_DRIFT = 0.15;

export interface ArmSummary { readonly arm: string; readonly precision: number; readonly drift: number; readonly coverageAuc: number; readonly needsOnlyRecapHarness: boolean }

export interface Decision { readonly defaultArm: string | null; readonly coverageArm: string | null; readonly why: string }

function whyOf(harness: ArmSummary | undefined, other: ArmSummary | undefined, best: number): string {
    if (harness !== undefined) return `${harness.arm}: a recap-writer harness within ${WITHIN_POINTS * 100} points of the best precision (${best.toFixed(3)}) with drift ${harness.drift.toFixed(3)} ≤ ${MAX_DRIFT}`;
    if (other === undefined) return 'no arm has drift within the limit: the default stays `recap`';
    return `${other.arm}: no recap-writer harness is within ${WITHIN_POINTS * 100} points of the best precision with drift ≤ ${MAX_DRIFT}`;
}

/**
 * The default decider is the arm needing nothing beyond the recap writer's harness whose policy precision is within 3 points of the best and
 * whose drift is at most 0.15 (the highest precision among them; arms are listed cheapest first, which breaks a tie). Another arm becomes the
 * default only when none of those exists: the most precise arm with drift at most 0.15. Coverage uses the arm with the best `brief_keeps_*` AUC.
 */
export function decide(arms: readonly ArmSummary[]): Decision {
    const rated = arms.filter((arm) => !Number.isNaN(arm.precision));
    const best = Math.max(...rated.map((arm) => arm.precision));
    const steady = rated.filter((arm) => arm.drift <= MAX_DRIFT);
    const closest = (list: readonly ArmSummary[]): ArmSummary | undefined => list.reduce<ArmSummary | undefined>((top, arm) => (top === undefined || arm.precision > top.precision ? arm : top), undefined);
    const harness = closest(steady.filter((arm) => arm.needsOnlyRecapHarness && arm.precision >= best - WITHIN_POINTS));
    const other = harness === undefined ? closest(steady) : undefined;
    const coverage = arms.filter((arm) => !Number.isNaN(arm.coverageAuc)).reduce<ArmSummary | undefined>((top, arm) => (top === undefined || arm.coverageAuc > top.coverageAuc ? arm : top), undefined);
    return { defaultArm: harness?.arm ?? other?.arm ?? null, coverageArm: coverage?.arm ?? null, why: whyOf(harness, other, best) };
}

export type { ArmName };
