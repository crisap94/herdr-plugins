import { test } from 'node:test';
import { requestOf } from '#test/support.ts';
import assert from 'node:assert/strict';
import { fakeOutput, fakeRuntime } from '#test/fakes/harness-runtime.ts';
import { LibraryHarness } from '#src/adapters/harness/library.ts';
import { CustomHarness, splitArgv } from '#src/adapters/harness/custom.ts';
import { readFileSync } from 'node:fs';
import { HarnessBrief } from '#src/adapters/job/brief.ts';
import { RecapWriter } from '#src/adapters/job/writer.ts';
import { instructions, message } from '#src/adapters/job/prompts/recap-prompt.ts';
import type { Harness } from '#src/ports/harness.ts';
import type { BackendId } from '#src/recap/domain/backend.ts';
import { isUnknown } from '#src/ports/unknowable.ts';

const request = requestOf({ entries: [{ role: 'user', text: 'hi' }] });

type Id = 'claude' | 'codex' | 'opencode';

async function requestSent(id: Id, settings: { readonly model: string; readonly effort: 'low' | 'medium' | 'high' | 'default' }): Promise<{ readonly effort?: unknown; readonly model?: unknown }> {
    const runtime = fakeRuntime({ scripts: { [id]: [fakeOutput({ text: 'ok' })] } });
    await new LibraryHarness(runtime, id, 1000, undefined, true).run({ instructions: 'do', input: 'in' }, settings);
    return runtime.calls[0]?.request ?? {};
}

const EFFORTS = ['low', 'medium', 'high', 'default'] as const;

const effortsOf = async (id: Id): Promise<unknown[]> => Promise.all(EFFORTS.map(async (effort) => (await requestSent(id, { model: '', effort })).effort));

test('effort: low, medium and high pass through for claude and codex, `default` passes the harness default, and opencode always does', async () => {
    assert.deepEqual(await effortsOf('claude'), ['low', 'medium', 'high', 'harness-default']);
    assert.deepEqual(await effortsOf('codex'), ['low', 'medium', 'high', 'harness-default']);
    assert.deepEqual(await effortsOf('opencode'), ['harness-default', 'harness-default', 'harness-default', 'harness-default']);
});

test('model: claude defaults to haiku and takes its own; codex and opencode send none when empty', async () => {
    const models = [await requestSent('claude', { model: '', effort: 'low' }), await requestSent('claude', { model: 'sonnet', effort: 'low' }), await requestSent('codex', { model: '', effort: 'low' }), await requestSent('opencode', { model: '', effort: 'low' })];
    assert.deepEqual(models.map((sent) => sent.model), ['haiku', 'sonnet', undefined, undefined]);
});

test('golden: the English instructions are exactly the reviewed operations-contract text', () => {
    const before = readFileSync(new URL('fixtures/instructions-en.txt', import.meta.url), 'utf8');
    assert.equal(instructions(request), before);
    assert.equal(instructions({ ...request, previousLanguage: 'en' }), before);
});

test('splitArgv: whitespace, quotes, no shell', () => {
    assert.deepEqual(splitArgv('  my-llm  --model "big one" \'a b\' x\'y\'z  '), ['my-llm', '--model', 'big one', 'a b', 'xyz']);
    assert.deepEqual(splitArgv('say ""'), ['say', '']);
    assert.deepEqual(splitArgv('   '), []);
    assert.deepEqual(splitArgv('echo $HOME; rm'), ['echo', '$HOME;', 'rm']);
});

const custom = (command: string, cwd: string, ms: number): Harness<BackendId> => new CustomHarness(command, cwd, ms);
const call = { instructions: instructions(request), input: message(request) };
const settings = { model: '', effort: 'default' as const };

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
    assert.equal(new LibraryHarness(fakeRuntime({ scripts: {} }), 'claude', 1).label({ model: '', effort: 'low' }), 'claude/haiku');
    assert.equal(new LibraryHarness(fakeRuntime({ scripts: {} }), 'codex', 1).label({ model: 'gpt-6-luna', effort: 'high' }), 'codex/gpt-6-luna');
    const writer = new RecapWriter(custom('bun -e "process.stdin.pipe(process.stdout)"', process.cwd(), 20_000), settings);
    const written = await writer.write(request);
    assert.ok(written.kind === 'written' && written.text.startsWith('<recap_input'));
    const brief = await new HarnessBrief(custom('bun -e "process.stdin.pipe(process.stdout)"', process.cwd(), 20_000), settings).write('<compaction_input version="1"/>');
    assert.ok(brief.kind === 'briefed' && brief.text.startsWith('<compaction_input') && brief.text.includes('first person'));
});
