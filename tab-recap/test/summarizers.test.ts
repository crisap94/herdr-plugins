import { test } from 'node:test';
import { requestOf } from '#test/support.ts';
import assert from 'node:assert/strict';
import { claudeArgs } from '#src/adapters/claude-harness.ts';
import { codexArgs } from '#src/adapters/codex-harness.ts';
import { CustomHarness, splitArgv } from '#src/adapters/custom-harness.ts';
import { hermesArgs, hermesUsage } from '#src/adapters/hermes-harness.ts';
import { opencodeArgs, opencodeOutput, sessionsTitled } from '#src/adapters/opencode-harness.ts';
import { readFileSync } from 'node:fs';
import { ClaudeHarness } from '#src/adapters/claude-harness.ts';
import { CodexHarness } from '#src/adapters/codex-harness.ts';
import { HarnessBrief } from '#src/adapters/harness-brief.ts';
import { HermesHarness } from '#src/adapters/hermes-harness.ts';
import { RecapWriter } from '#src/adapters/recap-writer.ts';
import { ARGV_BYTES, instructions, message } from '#src/adapters/recap-prompt.ts';
import type { Harness } from '#src/ports/harness.ts';
import type { BackendId } from '#src/recap/domain/backend.ts';
import { isUnknown } from '#src/ports/unknowable.ts';

const request = requestOf({ entries: [{ role: 'user', text: 'hi' }] });

test('golden: claude and codex are invoked exactly as before the harness work', () => {
    assert.deepEqual(claudeArgs('', instructions(request)), [
        '-p', '--model', 'haiku', '--no-session-persistence', '--tools', '', '--setting-sources', '',
        '--strict-mcp-config', '--output-format', 'json', '--system-prompt', instructions(request),
    ]);
    assert.deepEqual(claudeArgs('sonnet', instructions(request)).slice(0, 3), ['-p', '--model', 'sonnet']);
    assert.deepEqual(codexArgs('', '/w/o.md', 'default').slice(0, 8), [
        'exec', '--ephemeral', '--skip-git-repo-check', '--ignore-user-config', '-s', 'read-only', '--color', 'never',
    ]);
    assert.deepEqual(codexArgs('gpt-6-luna', '/w/o.md').slice(7, 10), ['never', '-m', 'gpt-6-luna']);
});

const LEAN = ['multi_agent', 'plugins', 'browser_use', 'computer_use', 'skill_search', 'tool_suggest', 'hooks'].flatMap((feature) => ['--disable', feature]);

test('effort: each harness gets its own word for it, and `default` passes nothing', () => {
    assert.deepEqual(codexArgs('', '/w/o.md', 'low').slice(8), ['-c', 'model_reasoning_effort=low', ...LEAN, '-o', '/w/o.md', '-']);
    assert.deepEqual(codexArgs('', '/w/o.md', 'high').slice(8, 10), ['-c', 'model_reasoning_effort=high']);
    assert.deepEqual(codexArgs('', '/w/o.md', 'default').slice(8), [...LEAN, '-o', '/w/o.md', '-']);
    assert.deepEqual(claudeArgs('', instructions(request), 'low').slice(-2), ['--effort', 'low']);
    assert.deepEqual(claudeArgs('', instructions(request), 'medium').slice(-2), ['--effort', 'medium']);
    assert.ok(!claudeArgs('', instructions(request), 'default').includes('--effort'));
    assert.deepEqual(opencodeArgs('', 't1', 'low').slice(-2), ['--variant', 'minimal']);
    assert.deepEqual(opencodeArgs('', 't1', 'high').slice(-2), ['--variant', 'high']);
    assert.ok(!opencodeArgs('', 't1', 'default').includes('--variant'));
    assert.deepEqual(hermesArgs('', 'P', 'u', 'low').slice(-4), ['--reasoning', 'low', '--usage-file', 'u']);
    assert.ok(!hermesArgs('', 'P', 'u', 'default').includes('--reasoning'));
});

test('golden: the English instructions are exactly the reviewed operations-contract text', () => {
    const before = readFileSync(new URL('fixtures/instructions-en.txt', import.meta.url), 'utf8');
    assert.equal(instructions(request), before);
    assert.equal(instructions({ ...request, previousLanguage: 'en' }), before);
});

test('opencode: JSON events, tools denied by the config the adapter sets; hermes: argv, safe mode, one inert toolset', () => {
    assert.deepEqual(opencodeArgs('', 't1'), ['run', '--pure', '--format', 'json', '--title', 't1']);
    assert.deepEqual(opencodeArgs('opencode/big-pickle', 't1'), ['run', '--pure', '--format', 'json', '--title', 't1', '-m', 'opencode/big-pickle']);
    assert.deepEqual(hermesArgs('', 'PROMPT', '/w/u.json'), ['-z', 'PROMPT', '--safe-mode', '-t', 'clarify', '--usage-file', '/w/u.json']);
    assert.deepEqual(hermesArgs('m1', 'P', 'u').slice(5, 7), ['-m', 'm1']);
});

test('opencode output: the text parts are the answer, step costs add up, the session id is kept for deletion', () => {
    const lines = [
        { type: 'step_start', sessionID: 'ses_1', part: { type: 'step-start' } },
        { type: 'text', sessionID: 'ses_1', part: { type: 'text', text: '## Goal\n- a' } },
        { type: 'text', sessionID: 'ses_1', part: { type: 'text', text: '\n- b' } },
        { type: 'step_finish', sessionID: 'ses_1', part: { type: 'step-finish', cost: 0.25 } },
        { type: 'step_finish', sessionID: 'ses_1', part: { type: 'step-finish', cost: 0.5 } },
    ].map((event) => JSON.stringify(event));
    const out = opencodeOutput(`${lines.join('\n')}\nnot json\n`);
    assert.deepEqual(out, { text: '## Goal\n- a\n- b', cost: 0.75, session: 'ses_1' });
    assert.deepEqual(opencodeOutput(''), { text: '', cost: 0, session: null });
});

test('a run that died before printing a session id is found again by its title', () => {
    const json = JSON.stringify([{ id: 'ses_a', title: 'tab-recap-1-2' }, { id: 'ses_b', title: 'mine' }, { id: 'ses_c', title: 'tab-recap-1-2' }]);
    assert.deepEqual(sessionsTitled(json, 'tab-recap-1-2'), ['ses_a', 'ses_c']);
    assert.deepEqual(sessionsTitled('not json', 'x'), []);
    assert.deepEqual(sessionsTitled('{}', 'x'), []);
});

test('hermes usage report: the cost including auxiliary calls, and the session to delete', () => {
    assert.deepEqual(hermesUsage('{"session_id":"s1","total_including_auxiliary":{"estimated_cost_usd":0.02}}'), { cost: 0.02, session: 's1' });
    assert.deepEqual(hermesUsage('garbage'), { cost: 0, session: null });
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
    const harness = custom('node -e "process.stdin.pipe(process.stdout)"', process.cwd(), 20_000);
    assert.equal(harness.label(settings), 'custom/node');
    const ran = await harness.run(call, settings);
    assert.ok(ran.kind === 'ran' && ran.text.includes('>hi</turn>') && ran.text.includes('JSON object') && ran.text.indexOf('<recap_input') < ran.text.indexOf('JSON object'), 'the data comes first, the instructions after');
    const empty = await custom('', process.cwd(), 1000).run(call, settings);
    assert.ok(isUnknown(empty));
    const broken = await custom('node -e "process.exit(3)"', process.cwd(), 20_000).run(call, settings);
    assert.ok(isUnknown(broken) && broken.why.why === 'failed');
});

test('a harness labels what it runs; the recap writer and the brief both go through run()', async () => {
    assert.equal(new ClaudeHarness(process.cwd(), 1).label({ model: '', effort: 'low' }), 'claude/haiku');
    assert.equal(new CodexHarness(process.cwd(), 1).label({ model: 'gpt-6-luna', effort: 'high' }), 'codex/gpt-6-luna');
    const writer = new RecapWriter(custom('node -e "process.stdin.pipe(process.stdout)"', process.cwd(), 20_000), settings);
    const written = await writer.write(request);
    assert.ok(written.kind === 'written' && written.text.startsWith('<recap_input'));
    const brief = await new HarnessBrief(custom('node -e "process.stdin.pipe(process.stdout)"', process.cwd(), 20_000), settings).write('<compaction_input version="1"/>');
    assert.ok(brief.kind === 'briefed' && brief.text.startsWith('<compaction_input') && brief.text.includes('first person'));
});

test('a harness that takes its prompt as an argument is given nothing longer than its limit; a brief too long for it is refused', async () => {
    const hermes = new HermesHarness(process.cwd(), 1);
    assert.equal(hermes.limit, ARGV_BYTES);
    const refused = await new HarnessBrief(hermes, settings).write('x'.repeat(ARGV_BYTES));
    assert.ok(isUnknown(refused) && refused.why.why === 'unreadable');
});
