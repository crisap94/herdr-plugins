import { uncheckedTypeId } from '#src/recap/domain/type-id.ts';
import { parseHandoffId } from '#src/recap/domain/ids.ts';
import type { HandoffId } from '#src/recap/domain/ids.ts';
import { idOf, typeIdOf } from './typeid.ts';

export const handoffIdOf = (id: Uint8Array): HandoffId => {
    const parsed = parseHandoffId(typeIdOf('handoff', id));
    if (parsed === null) {
        throw new Error('a handoff id must be a TypeID: hnd_ and 26 base32 characters');
    }
    return parsed;
};

export const handoffBytesOf = (id: HandoffId): Uint8Array | null => idOf('handoff', uncheckedTypeId(id));
