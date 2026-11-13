import { summarizerFor } from '../../../../tab-recap/src/daemon/backends.ts';
import type { Fleet } from '../../../../tab-recap/src/adapters/herdr/fleet.ts';
export { columnOf } from '../../../../tab-recap/src/column/column.ts';
const dispatch = await import('../../../../tab-recap/src/protocol/dispatch.ts');
import { createEngine } from '../../../../tab-recap/src/recap/application/../../daemon/main.ts';

export const probe = [summarizerFor, dispatch, createEngine];
export type Probe = Fleet;
