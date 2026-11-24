import { textOf } from '@stateforge-labs/session-ledger';
import { test } from 'node:test';
import { requestOf } from '#test/support.ts';
import assert from 'node:assert/strict';
import { ask, choice, customHarness, fakeOutput, fakeRuntime, libraryHarness } from '#test/fakes/harness-runtime.ts';
import { splitArgv } from '#src/adapters/harness/custom.ts';
import { must } from '@stateforge-labs/session-ledger';
import { parseText } from '@stateforge-labs/session-ledger';
import { readFileSync } from 'node:fs';
import { HarnessBrief } from '#src/adapters/job/brief.ts';
import { RecapWriter } from '#src/adapters/job/writer.ts';
import { instructions, messageText } from '#src/adapters/job/prompts/recap-prompt.ts';
import type { HarnessChoice } from '#src/ports/harness.ts';
import { isUnknown } from '@stateforge-labs/session-ledger';

const request = requestOf({ entries: [{ role: 'user', text: textOf('hi') }] });

type Id = 'claude' | 'codex' | 'opencode';

async function requestSent(id: Id, settings: HarnessChoice): Promise<{ readonly effort?: unknown; readonly model?: unknown }> {
    const runtime = fakeRuntime({ scripts: { [id]: [fakeOutput({ text: 'ok' })] } });
    await libraryHarness(runtime, id, 1000, undefined, true).run(ask('do', 'in'), settings);
    return runtime.calls[0]?.request ?? {};
}

const EFFORTS = ['low', 'medium', 'high', 'default'] as const;

const effortsOf = async (id: Id): Promise<unknown[]> => Promise.all(EFFORTS.map(async (effort) => (await requestSent(id, choice('', effort))).effort));

test('effort: low, medium and high pass through for claude and codex, `default` passes the harness default, and opencode always does', async () => {
    assert.deepEqual(await effortsOf('claude'), ['low', 'medium', 'high', 'harness-default']);
    assert.deepEqual(await effortsOf('codex'), ['low', 'medium', 'high', 'harness-default']);
    assert.deepEqual(await effortsOf('opencode'), ['harness-default', 'harness-default', 'harness-default', 'harness-default']);
});

test('model: claude defaults to haiku and takes its own; codex and opencode send none when empty', async () => {
    const models = [await requestSent('claude', choice('', 'low')), await requestSent('claude', choice('sonnet', 'low')), await requestSent('codex', choice('', 'low')), await requestSent('opencode', choice('', 'low'))];
    assert.deepEqual(models.map((sent) => sent.model), ['haiku', 'sonnet', undefined, undefined]);
});

test('golden: the English instructions are exactly the reviewed operations-contract text', () => {
    const before = readFileSync(new URL('fixtures/instructions-en.txt', import.meta.url), 'utf8');
    assert.equal(instructions(request), before);
    assert.equal(instructions({ ...request, previousLanguage: textOf('en') }), before);
});

const argvOf = (line: string): string[] => splitArgv(must(parseText(line)));

test('splitArgv: whitespace, quotes, no shell', () => {
    assert.deepEqual(argvOf('  my-llm  --model "big one" \'a b\' x\'y\'z  '), ['my-llm', '--model', 'big one', 'a b', 'xyz']);
    assert.deepEqual(argvOf('say ""'), ['say', '']);
    assert.deepEqual(argvOf('   '), []);
    assert.deepEqual(argvOf('echo $HOME; rm'), ['echo', '$HOME;', 'rm']);
});

const custom = customHarness;
const call = ask(instructions(request), messageText(request));
const settings = choice('', 'default');

test('custom: the data and the instructions go in on stdin, the data first, and the answer comes out on stdout', async () => {
    const harness = custom('bun -e "process.stdin.pipe(process.stdout)"', process.cwd(), 20_000);
    assert.equal(harness.label(settings), 'custom/bun');
    const ran = await harness.run(call, settings);
    assert.ok(ran.kind === 'ran' && ran.text.includes('>hi</turn>') && ran.text.includes('JSON object') && ran.text.indexOf('<recap_input') < ran.text.indexOf('JSON object'), 'the data comes first, the instructions after');
    const empty = await custom('', process.cwd(), 1000).run(call, settings);
    assert.ok(isUnknown(empty));
    const broken = await custom('bun -e "process.exit(3)"', process.cwd(), 20_000).run(call, settings);
    assert.ok(isUnknown(broken) && broken.why.why === 'failed');
});

test('a harness labels what it runs; the recap writer and the brief both go through run()', async () => {
    assert.equal(libraryHarness(fakeRuntime({ scripts: {} }), 'claude', 1).label(choice('', 'low')), 'claude/haiku');
    assert.equal(libraryHarness(fakeRuntime({ scripts: {} }), 'codex', 1).label(choice('gpt-6-luna', 'high')), 'codex/gpt-6-luna');
    const writer = new RecapWriter(custom('bun -e "process.stdin.pipe(process.stdout)"', process.cwd(), 20_000), settings);
    const written = await writer.write(request);
    assert.ok(written.kind === 'written' && written.text.startsWith('<recap_input'));
    const brief = await new HarnessBrief(custom('bun -e "process.stdin.pipe(process.stdout)"', process.cwd(), 20_000), settings).write(textOf('<compaction_input version="1"/>'));
    assert.ok(brief.kind === 'briefed' && brief.text.startsWith('<compaction_input') && brief.text.includes('first person'));
});
