// `tab-recap eval`: judge stored recaps, label items, compare the judge with the operator, count the gates. Exit: 0 done · 1 no judge, every run failed or the state is unusable · 2 usage.
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { RUBRIC_TEXT } from '#src/adapters/rubric.ts';
import { stateStore } from '#src/adapters/db/database.ts';
import { PathHarnesses } from '#src/adapters/path-harnesses.ts';
import { styleFor } from '#src/adapters/terminal-style.ts';
import { AUTO_ORDER, judgeFor } from '#src/daemon/backends.ts';
import { loadConfig, messagesOf, stateDir } from '#src/daemon/config.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import { EVAL_USAGE, parseEval } from '#src/recap/application/eval-options.ts';
import { anchorsOf, withText } from '#src/recap/application/judge-anchors.ts';
import { runEval } from '#src/recap/application/eval-run.ts';
import { replayCommand } from './replay.ts';

/** The operator's lines, one at a time; null once the input has ended (readline's own question would wait forever then). */
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
    const parsed = parseEval(argv);
    if (parsed.kind === 'usage') {
        console.error(`tab-recap: 2 — ${parsed.why}\n${EVAL_USAGE}`);
        return 2;
    }
    if (parsed.options.mode === 'replay') {
        return replayCommand(parsed.options);
    }
    const store = stateStore(stateDir());
    if (store.kind !== 'ready') {
        console.error(`tab-recap: 1 — ${messagesOf().database.newer(store.backup)}`);
        return 1;
    }
    const operator = lines();
    try {
        const found = await new PathHarnesses(AUTO_ORDER).available();
        const available = isUnknown(found) ? [] : found.ids;
        return await runEval(parsed.options, {
            inputs: store.inputs, verdicts: store.verdicts, now: Date.now, rubric: RUBRIC_TEXT, style: styleFor(process.stdout),
            judge: () => judgeFor(loadConfig(), available, join(stateDir(), 'summarizer'), anchorsOf(withText(store.verdicts.disagreements(), store.inputs))),
            out: (line) => { console.log(line); },
            err: (line) => { console.error(line); },
            ask: (prompt) => operator.ask(prompt),
        });
    } finally {
        operator.close();
        store.close();
    }
}
