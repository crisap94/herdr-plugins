import { fileURLToPath } from 'node:url';
import { Codex } from '@openai/codex-sdk';
import type { ModelReasoningEffort, ThreadItem } from '@openai/codex-sdk';
import { childEnv, emptyCwd, failedCall, failureOf } from './env.ts';
import type { Adapter, Call, Called } from './types.ts';

const ISOLATED_CODEX = fileURLToPath(new URL('./codex-isolated.sh', import.meta.url));
const SEPARATOR = '\n\n';
const FEATURES_OFF = { multi_agent: false, plugins: false, browser_use: false, computer_use: false, skill_search: false, tool_suggest: false, hooks: false };
const EFFORTS: readonly string[] = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra', 'persistent'];
const DROPPED = ['OPENAI_API_KEY', 'CODEX_API_KEY'];

export const codex: Adapter = async (call: Call): Promise<Called> => {
    if (!EFFORTS.includes(call.effort)) return failedCall('config', `effort ${call.effort} is not a Codex reasoning effort`, 0);
    const client = new Codex({ codexPathOverride: ISOLATED_CODEX, env: childEnv(DROPPED), config: { features: FEATURES_OFF } });
    const thread = client.startThread({
        model: call.model,
        modelReasoningEffort: call.effort as ModelReasoningEffort,
        sandboxMode: 'read-only',
        approvalPolicy: 'never',
        webSearchMode: 'disabled',
        networkAccessEnabled: false,
        workingDirectory: emptyCwd(),
        skipGitRepoCheck: true,
    });
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), call.timeoutMs);
    const started = performance.now();
    try {
        const turn = await thread.run(`${call.system}${SEPARATOR}${call.user}`, { signal: abort.signal, ...(call.schema === undefined ? {} : { outputSchema: call.schema }) });
        const usage = turn.usage;
        const commands = turn.items.filter((item: ThreadItem) => item.type === 'command_execution').length;
        return {
            text: turn.finalResponse,
            structured: undefined,
            failure_kind: null,
            failure_detail: null,
            input_tokens: usage?.input_tokens ?? 0,
            cache_read_tokens: usage?.cached_input_tokens ?? 0,
            cache_write_tokens: usage?.cache_write_input_tokens ?? 0,
            output_tokens: usage?.output_tokens ?? 0,
            reasoning_tokens: usage?.reasoning_output_tokens ?? 0,
            cost_usd: null,
            cost_basis: null,
            latency_ms: Math.round(performance.now() - started),
            models: [call.model],
            anomalies: commands > 0 ? [`command_execution:${commands}`] : [],
        };
    } catch (error) {
        const failure = failureOf(error);
        return failedCall(failure.kind, failure.detail, Math.round(performance.now() - started));
    } finally {
        clearTimeout(timer);
    }
};
