import { createEngine } from '../../../../tab-recap/src/recap/application/engine.ts';
import type { Clock } from '../../../../tab-recap/src/ports/clock.ts';
import { storeOver } from '../../../../tab-recap/src/adapters/db/database.ts';
import { ClaudeTranscripts } from '../../../../tab-recap/src/adapters/transcripts/claude/transcripts.ts';

export const probe = [createEngine, storeOver, ClaudeTranscripts];
export type Probe = Clock;
