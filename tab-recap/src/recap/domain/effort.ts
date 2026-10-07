/** How hard the recap writer thinks. `default` passes nothing: the harness keeps its own setting. */
export const EFFORTS = ['low', 'medium', 'high', 'default'] as const;
export type Effort = (typeof EFFORTS)[number];

/** What the ledger's operations need when nothing is set: at `low` the writer files choices as open questions and adds no decisions (measured on a replay); `medium` records them with their why. */
export const DEFAULT_EFFORT: Effort = 'medium';

/** The effort named by a setting; anything unknown is the default. */
export const effortOf = (raw: string | undefined): Effort => EFFORTS.find((effort) => effort === (raw ?? '').trim().toLowerCase()) ?? DEFAULT_EFFORT;

/** The level a harness is told, or null when it is told nothing. `levels` maps the harness's own word for low. */
export function levelOf(effort: Effort, low: string): string | null {
    if (effort === 'default') {
        return null;
    }
    return effort === 'low' ? low : effort;
}
