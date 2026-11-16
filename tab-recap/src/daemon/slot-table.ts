import type { SlotEntry } from './slots.ts';
import * as hooks from './slots/hooks.ts';
import * as view from './slots/view.ts';
import * as roll from './slots/roll.ts';
import * as timing from './slots/timing.ts';

export const SLOT_TABLE: readonly SlotEntry[] = [
    { name: 'hooks', key: 'TAB_RECAP_HOOKS', defaultOn: hooks.defaultOn, slot: hooks.slot },
    { name: 'view', key: 'TAB_RECAP_VIEW_SERVER', defaultOn: view.defaultOn, slot: view.slot },
    { name: 'roll', key: 'TAB_RECAP_SELF_ROLL', defaultOn: roll.defaultOn, slot: roll.slot },
    { name: 'timing', key: 'TAB_RECAP_TIMING_EVENTS', defaultOn: timing.defaultOn, slot: timing.slot },
];
