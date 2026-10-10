import type { HandoffId } from '#src/recap/domain/ids.ts';
import { idOf, typeIdOf } from './typeid.ts';

export const handoffIdOf = (id: Uint8Array): HandoffId => typeIdOf('handoff', id) as HandoffId;

export const handoffBytesOf = (id: HandoffId): Uint8Array | null => idOf('handoff', id);
