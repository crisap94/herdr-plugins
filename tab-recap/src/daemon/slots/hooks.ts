import type { Mode, Running, SlotModule } from '../slots.ts';

export const defaultOn: Mode = 'off';
export const slot: SlotModule = { start: (): Running => ({ stop: (): void => {} }) };
