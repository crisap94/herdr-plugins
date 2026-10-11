import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClaudeTranscripts } from '#src/adapters/claude-transcripts.ts';
import { HandoffConfirmation } from '#src/recap/application/handoff-confirmation.ts';
import { HANDOFF_OBSERVATIONS } from '#src/recap/application/handoff-limits.ts';
import type { HandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import type { AgentState } from '#src/ports/agents.ts';
import { registryWith } from './fakes/transcript-registry.ts';
import { laneWith, planWith, readyOf } from './fakes/handoff-delivery.ts';

const TEXT = 'Handoff of the parser refactor.\n\nNext steps:\n  - finish the lexer\n  - run the suite';
const EARLIER = 'Handoff of the lexer spike.\n\nNext steps:\n  - write the tests';
const DELIVERED: HandoffOutcome = { kind: 'delivered' };
const FAILED: HandoffOutcome = { kind: 'failed', reason: 'unconfirmed' };

const wrapped = (body: string): string => `\n\n<pasted_content id="k7m2">\n${body}\n</pasted_content id="k7m2">\n`;
const userRow = (content: string): string => `${JSON.stringify({ type: 'user', message: { content } })}\n`;

function scratchClaude(initial: string): { readonly root: string; readonly file: string; readonly cleanup: () => void } {
    const root = mkdtempSync(join(tmpdir(), 'claude-handoff-'));
    mkdirSync(join(root, 'proj'));
    const file = join(root, 'proj', 'sess-1.jsonl');
    writeFileSync(file, initial);
    return { root, file, cleanup: (): void => rmSync(root, { recursive: true }) };
}

function confirmerOver(root: string, onPause: () => void): { readonly confirmer: HandoffConfirmation; readonly pauses: number[] } {
    const pauses: number[] = [];
    const confirmer = new HandoffConfirmation({
        agents: { status: async (): Promise<AgentState> => ({ kind: 'agent', agent: 'claude', status: 'idle' }) },
        transcripts: registryWith({ claude: new ClaudeTranscripts(root) }),
        session: async (): Promise<string> => 'sess-1',
        pause: async (ms: number): Promise<void> => {
            pauses.push(ms);
            onPause();
        },
    });
    return { confirmer, pauses };
}

async function deliver(root: string, text: string, onPause: () => void): Promise<{ readonly outcome: HandoffOutcome; readonly pauses: number[] }> {
    const { confirmer, pauses } = confirmerOver(root, onPause);
    const target = readyOf(laneWith({ session: 'sess-1' }), planWith('transcript'), true);
    const baseline = await confirmer.baseline(target);
    return { outcome: await confirmer.confirm(target, baseline, text), pauses };
}

test('a wrapped multi-line handoff in the real Claude transcript confirms delivery at the first observation', async () => {
    const lane = scratchClaude(userRow(wrapped(EARLIER)));
    try {
        const run = await deliver(lane.root, TEXT, () => appendFileSync(lane.file, userRow(wrapped(TEXT))));
        assert.deepEqual(run.outcome, DELIVERED);
        assert.equal(run.pauses.length, 1);
    } finally {
        lane.cleanup();
    }
});

test('an earlier wrapped handoff is not mistaken for the new one, and nothing arriving is unconfirmed', async () => {
    const lane = scratchClaude(userRow(wrapped(TEXT)));
    try {
        const run = await deliver(lane.root, TEXT, () => undefined);
        assert.deepEqual(run.outcome, FAILED);
        assert.equal(run.pauses.length, HANDOFF_OBSERVATIONS);
    } finally {
        lane.cleanup();
    }
});
