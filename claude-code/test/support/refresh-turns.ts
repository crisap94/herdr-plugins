import { setTimeout as delay } from 'node:timers/promises';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { instant } from '../../../tab-recap/src/recap/domain/time.ts';
import type { Instant } from '../../../tab-recap/src/recap/domain/time.ts';
import { NO_REPOS } from '../../../tab-recap/test/support.ts';
import { writer } from '../../../tab-recap/test/fakes/golden-writer.ts';
import { composeEngine, followedOf } from '../../src/compose.ts';
import { TURNS } from './host.ts';

const [root = '', stateDir = '', session = '', startAt = '0'] = process.argv.slice(2);
const records = join(root, 'projects', '-work', `${session}.jsonl`);
mkdirSync(dirname(records), { recursive: true });
writeFileSync(records, '');
const { summarizer } = writer();
let now = 1;
while (Date.now() < Number(startAt)) {
    await delay(1);
}
const composed = composeEngine({ stateDir, records, summarizer: () => summarizer, language: () => 'en', clock: { now: (): Instant => instant(now) }, repos: NO_REPOS, log: (line) => { process.stderr.write(`${line}\n`); } });
if (composed.kind !== 'ready') {
    process.stdout.write('newer-db');
    process.exit(1);
}
const followed = followedOf({ session, records, cwd: root });
for (const turn of [0, 1, 2]) {
    const lines = TURNS.slice(turn * 2, turn * 2 + 2);
    appendFileSync(records, lines.map((line) => `${line}\n`).join(''));
    now = Math.max(now + 1, ...lines.map((line) => Date.parse((JSON.parse(line) as { timestamp: string }).timestamp)).filter((at) => !Number.isNaN(at)));
    await composed.engine.refresh(followed.scope, [followed.session]);
}
composed.close();
process.stdout.write('done');
