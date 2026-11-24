import { createInterface } from 'node:readline';
import { RUBRIC_TEXT } from '#src/adapters/job/prompts/rubric.ts';
import { notReadyLine, openCliStore } from '#src/daemon/cli-store.ts';
import { AUTO_PATH_KINDS, PathHarnessDirectory } from '#src/adapters/harness/on-path.ts';
import { styleFor } from '#src/adapters/os/terminal-style.ts';
import { must } from '@stateforge-labs/session-ledger';
import { parseDirectory } from '@stateforge-labs/session-ledger';
import { join } from 'node:path';
import { availableIn, judgeWith } from '#src/daemon/backends.ts';
import { loadSettings, messagesOf, stateDirectory } from '#src/daemon/config.ts';
import { isUnknown } from '@stateforge-labs/session-ledger';
import { textOf } from '@stateforge-labs/session-ledger';
import { instant } from '@stateforge-labs/session-ledger';
import { EVAL_USAGE, parseEvalRequest } from '#src/recap/application/eval-options.ts';
import { anchorsOf, withText } from '#src/recap/application/judge-anchors.ts';
import { createRuntime } from '@stateforge-labs/harness-adapters/runtime';
import { runEval } from '#src/recap/application/eval-run.ts';
import { replayCommand } from './replay.ts';

function lines(): { ask(prompt: string): Promise<string | null>; close(): void } {
    const reader = createInterface({ input: process.stdin });
    const queue: string[] = [];
    const waiting: ((line: string | null) => void)[] = [];
    let closed = false;
    reader.on('line', (line) => { const next = waiting.shift(); if (next === undefined) { queue.push(line); } else { next(line); } });
    reader.on('close', () => { closed = true; for (const next of waiting.splice(0)) { next(null); } });
    return {
        ask: (prompt) => {
            process.stdout.write(prompt);
            const line = queue.shift();
            if (line !== undefined || closed) {
                return Promise.resolve(line ?? null);
            }
            return new Promise((resolve) => { waiting.push(resolve); });
        },
        close: () => { reader.close(); },
    };
}

export async function evalCommand(argv: readonly string[]): Promise<number> {
    const parsed = parseEvalRequest(argv.map(textOf));
    if (parsed.kind === 'usage') {
        console.error(`tab-recap: 2 — ${parsed.why}\n${EVAL_USAGE}`);
        return 2;
    }
    if (parsed.options.mode === 'replay') {
        return replayCommand(parsed.options);
    }
    const store = openCliStore();
    if (store.kind !== 'ready') {
        console.error(`tab-recap: 1 — ${notReadyLine(store, messagesOf())}`);
        return 1;
    }
    const operator = lines();
    try {
        const found = await new PathHarnessDirectory(AUTO_PATH_KINDS).available();
        const available = isUnknown(found) ? [] : found.ids;
        const runtime = createRuntime();
        return await runEval(parsed.options, {
            inputs: store.inputs, verdicts: store.verdicts, now: () => instant(Date.now()), rubric: textOf(RUBRIC_TEXT), style: styleFor(process.stdout),
            judge: () => judgeWith(loadSettings(), availableIn(available), must(parseDirectory(join(stateDirectory(), 'summarizer'))), runtime, anchorsOf(withText(store.verdicts.disagreements(), store.inputs))),
            out: (line) => { console.log(line); },
            err: (line) => { console.error(line); },
            ask: async (prompt) => {
                const line = await operator.ask(prompt);
                return line === null ? null : textOf(line);
            },
        });
    } finally {
        operator.close();
        store.close();
    }
}
