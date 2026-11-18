export const EFFORTS = ['low', 'medium', 'high', 'default'] as const;
export type Effort = (typeof EFFORTS)[number];

export const DEFAULT_EFFORT: Effort = 'medium';

export function parseEffort(raw: unknown): Effort {
    const text = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    return EFFORTS.find((effort) => effort === text) ?? DEFAULT_EFFORT;
}

export const effortOf = parseEffort;
