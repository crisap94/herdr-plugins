import { requestId } from '#src/recap/domain/ids.ts';
import { randomUUID } from 'node:crypto';

export const leak = [requestId, randomUUID];
