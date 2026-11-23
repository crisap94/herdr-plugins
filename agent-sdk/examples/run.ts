import { query } from '@anthropic-ai/claude-agent-sdk';
import type { Writer } from '@stateforge-labs/session-ledger';
import { createLedgerEngine, createSessionLedger } from '../src/index.ts';

export const runner = (writer: Writer) => {
    const made = createLedgerEngine({ path: process.env.LEDGER_DB ?? 'ledger.db', writer });
    if (made.kind !== 'ready') {
        throw new Error(`the ledger file is ${made.kind}`);
    }
    const ledger = createSessionLedger(made.engine, {}, process.env);
    return (prompt: string) =>
        query({
            prompt,
            options: {
                hooks: ledger.hooks,
                env: { ...process.env, ...ledger.env },
            },
        });
};
