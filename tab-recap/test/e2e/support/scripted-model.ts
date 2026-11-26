import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [directory] = process.argv.slice(2);
if (directory === undefined) {
    throw new Error('scripted-model needs the model directory');
}

const calls = join(directory, 'calls');
mkdirSync(calls, { recursive: true });
const input = readFileSync(0, 'utf8');
const number = readdirSync(calls).length + 1;
writeFileSync(join(calls, `${number}.txt`), input);

const scripted = join(directory, 'answers', String(number));
const fallback = join(directory, 'answers', 'default');
const answer = readFileSync(existsSync(scripted) ? scripted : fallback, 'utf8');

if (answer.startsWith('!fail')) {
    process.stderr.write('the scripted model failed\n');
    process.exit(1);
}

if (answer.startsWith('!hang')) {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => undefined, 1000)'], { stdio: 'ignore' });
    writeFileSync(join(directory, 'pids.json'), JSON.stringify({ script: process.pid, child: child.pid }));
    setInterval(() => undefined, 1000);
} else {
    process.stdout.write(answer);
}
