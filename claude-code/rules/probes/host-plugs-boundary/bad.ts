import { createEngine } from '../../../../tab-recap/src/recap/application/engine.ts';
import { summarizerFor } from '../../../../tab-recap/src/daemon/backends.ts';

export const probe = [createEngine, summarizerFor];
