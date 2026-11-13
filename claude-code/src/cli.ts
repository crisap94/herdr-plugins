import { homedir } from 'node:os';
import { stateDirOf, systemClock } from './compose.ts';
import { fileLog } from './runner.ts';
import { stdinText } from './stdin.ts';
import { lineAnswer, showAnswer, USAGE } from './show.ts';
import type { CommandAnswer, CommandIo } from './show.ts';

const env = process.env;
const stateDir = stateDirOf(env, homedir());
const io: CommandIo = { stateDir, cwd: process.cwd(), clock: systemClock, log: fileLog(stateDir) };
const [command = '', ...args] = process.argv.slice(2);

async function answerFor(): Promise<CommandAnswer> {
    switch (command) {
        case 'show':
            return showAnswer(io, args);
        case 'line':
            return args.length === 0 ? lineAnswer(io, await stdinText()) : { code: 2, out: '', err: USAGE };
        default:
            return { code: 2, out: '', err: USAGE };
    }
}

const answer = await answerFor();
process.stdout.write(answer.out);
process.stderr.write(answer.err);
process.exitCode = answer.code;
