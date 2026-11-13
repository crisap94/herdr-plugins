import { homedir } from 'node:os';
import { stateDirOf, systemClock } from './compose.ts';
import { answerOf } from './hook.ts';
import { fileLog } from './runner.ts';
import { stdinText } from './stdin.ts';
import { detachedRunner } from './start-runner.ts';

const env = process.env;
const stateDir = stateDirOf(env, homedir());
const log = fileLog(stateDir);
const [expected = ''] = process.argv.slice(2);

try {
    const answer = answerOf(expected, await stdinText(), { env, stateDir, clock: systemClock, log, startRunner: detachedRunner(stateDir, env, log) });
    if (answer.kind === 'print') {
        process.stdout.write(answer.text);
    }
} catch (error) {
    log(`${expected}: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
}
process.exitCode = 0;
