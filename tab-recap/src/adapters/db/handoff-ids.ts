import { uncheckedTypeId } from '#src/recap/domain/type-id.ts';
import { textOf } from '#src/recap/domain/text.ts';
import { handoffId } from '#src/recap/domain/ids.ts';
import type { HandoffId } from '#src/recap/domain/ids.ts';
import { idOf, typeIdOf } from './typeid.ts';

export const handoffIdOf = (id: Uint8Array): HandoffId => handoffId(textOf(typeIdOf('handoff', id)));

export const handoffBytesOf = (id: HandoffId): Uint8Array | null => idOf('handoff', uncheckedTypeId(id));
