import { query } from '@anthropic-ai/claude-agent-sdk';
import { createEngine } from '@stateforge-labs/session-ledger';
import { createEngineWorld } from '@stateforge-labs/session-ledger/testkit';
import { createSessionLedger } from '../src/index.ts';

const engine = createEngine(createEngineWorld().plugs);
const ledger = createSessionLedger(engine, {}, process.env);

export const run = (prompt: string) =>
    query({
        prompt,
        options: {
            hooks: ledger.hooks,
            env: { ...process.env, ...ledger.env },
        },
    });
