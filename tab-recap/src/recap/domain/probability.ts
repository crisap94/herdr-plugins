import { brand, type Brand } from '@stateforge-labs/session-ledger/unstable/recap/domain/brand.ts';

export type Probability = Brand<number, 'Probability'>;

export function parseProbability(input: unknown): Probability | null {
    return typeof input === 'number' && Number.isFinite(input) && input >= 0 && input <= 1 ? brand<number, 'Probability'>(input) : null;
}
