import { claude } from './claude.ts';
import { codex } from './codex.ts';
import { judgeOne } from './judge.ts';
import type { Called } from './types.ts';

const brief = (called: Called): string => JSON.stringify({ text: called.text?.slice(0, 120) ?? null, failure_kind: called.failure_kind, failure_detail: called.failure_detail, input_tokens: called.input_tokens, output_tokens: called.output_tokens, cost_usd: called.cost_usd, cost_basis: called.cost_basis, latency_ms: called.latency_ms, models: called.models, anomalies: called.anomalies });

const system = 'Reply with exactly one word: the colour named in the message.';
const user = 'The lantern-ui banner on orchard.test is teal.';
console.log('claude', brief(await claude({ system, user, model: 'claude-haiku-5-5', effort: 'low', timeoutMs: 120000 })));
console.log('codex', brief(await codex({ system, user, model: 'gpt-6-luna', effort: 'low', timeoutMs: 120000 })));
const judged = await judgeOne(claude, [
    { id: 'P1', rule: 'the answer names a colour.', breach: 'no colour is named.' },
    { id: 'P2', rule: 'the answer names a city.', breach: 'no city is named.' },
], { case: user, answer: 'teal' }, [], { until: 0 }, (line) => console.error(line));
console.log('judge', JSON.stringify(judged));
