import type { Brand } from './brand.ts';

export type ByteBudget = Brand<number, 'ByteBudget'>;

export function byteBudgetOf(bytes: number): ByteBudget {
    if (!Number.isSafeInteger(bytes) || bytes <= 0) {
        throw new RangeError('a byte budget is a positive integer');
    }
    return bytes as ByteBudget;
}

export const fits = (budget: ByteBudget, bytes: number): boolean => bytes <= budget;
