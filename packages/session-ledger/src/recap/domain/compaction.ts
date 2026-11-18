import { compactableKinds } from './legacy.ts';
import type { ContextObserved, WindowBasis } from './legacy.ts';
import { REGISTERED_KINDS } from './registered-kinds.ts';

export const COMPACTABLE = compactableKinds(REGISTERED_KINDS);

export type WindowSource = 'agent' | 'catalogue' | 'table' | 'observed' | 'setting';

export type WindowOf = (observed: ContextObserved) => WindowBasis | null;

export type { CompactTarget, ContextObserved as Observed, ContextUse, WindowBasis } from './legacy.ts';
export { compactableKinds, contextOf, HINT_DEFAULT, HINT_MAX, HINT_MIN, hintFor, hintOf, hintSetting, parseCompactTarget as targetOf, shareOf, sizeOf, targetSetting, tokensOf, windowOf, windowSetting } from './legacy.ts';
