export const EFFORTS = ['low', 'medium', 'high', 'default'] as const;
export type Effort = (typeof EFFORTS)[number];

export const DEFAULT_EFFORT: Effort = 'medium';

export const effortOf = (raw: string | undefined): Effort => EFFORTS.find((effort) => effort === (raw ?? '').trim().toLowerCase()) ?? DEFAULT_EFFORT;

export function levelOf(effort: Effort, low: string): string | null {
    if (effort === 'default') {
        return null;
    }
    return effort === 'low' ? low : effort;
}
