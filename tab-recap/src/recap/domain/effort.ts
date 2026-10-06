/** How hard the recap writer thinks. `default` passes nothing: the harness keeps its own setting. */
export const EFFORTS = ['low', 'medium', 'high', 'default'] as const;
export type Effort = (typeof EFFORTS)[number];

/** What a recap needs when nothing is set: a short rewrite, not a deliberation. */
export const DEFAULT_EFFORT: Effort = 'low';

/** The effort named by a setting; anything unknown is the default. */
export const effortOf = (raw: string | undefined): Effort => EFFORTS.find((effort) => effort === (raw ?? '').trim().toLowerCase()) ?? DEFAULT_EFFORT;

/** The level a harness is told, or null when it is told nothing. `levels` maps the harness's own word for low. */
export function levelOf(effort: Effort, low: string): string | null {
    if (effort === 'default') {
        return null;
    }
    return effort === 'low' ? low : effort;
}
