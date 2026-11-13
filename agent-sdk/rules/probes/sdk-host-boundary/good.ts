import { createEngine } from '../../../../tab-recap/src/recap/application/engine.ts';
import { FORBIDDEN } from '../../../../tab-recap/src/recap/domain/forbidden-words.ts';
import type { Clock } from '../../../../tab-recap/src/ports/clock.ts';
import { compose } from '../../../../claude-code/src/compose.ts';
import { runner } from '../../../../claude-code/src/runner.ts';
import { host } from '../../../../claude-code/test/support/host.ts';
import { query } from '@anthropic-ai/claude-agent-sdk';

export const probe = [createEngine, FORBIDDEN, compose, runner, host, query];
export type Probe = Clock;
