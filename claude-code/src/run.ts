import { homedir } from 'node:os';
import { stateDirOf } from './compose.ts';
import { fileLog, runAfterStop } from './runner.ts';
import { hookArgsOf, runnerPlugsFor } from './runner-plugs.ts';
import { noteSession } from './sessions.ts';

const env = process.env;
const stateDir = stateDirOf(env, homedir());
const log = fileLog(stateDir);
const args = hookArgsOf(process.argv.slice(2));

if (args.kind === 'usage') {
    log('runner: usage: run.ts <session> <transcript> <cwd>');
} else {
    try {
        noteSession(stateDir, args.hook, Date.now());
        const result = await runAfterStop(runnerPlugsFor(args.hook, env, stateDir, log));
        if (result.kind === 'marked') {
            log(`runner: ${args.hook.session} is being brought up to date by another runner; marked`);
        }
    } catch (error) {
        log(`runner: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
    }
}
process.exitCode = 0;
