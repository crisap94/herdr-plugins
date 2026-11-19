import type { Mode, SlotModule } from '../slots.ts';

export const defaultOn: Mode = 'on';
export const slot: SlotModule = {
    start: (context) => import('#src/adapters/hooks/start.ts').then((mod) => mod.startHooks(context)),
};
