import { query } from '@anthropic-ai/claude-agent-sdk';
import type { EffortLevel, SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import { childEnv, emptyCwd, failedCall, failureOf } from './env.ts';
import type { Adapter, Call, Called } from './types.ts';

const EFFORTS: readonly string[] = ['low', 'medium', 'high', 'xhigh', 'max'];
const DROPPED = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDECODE'];

export const claude: Adapter = async (call: Call): Promise<Called> => {
    if (!EFFORTS.includes(call.effort)) return failedCall('config', `effort ${call.effort} is not a Claude effort level`, 0);
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), call.timeoutMs);
    const started = performance.now();
    const anomalies: string[] = [];
    let result: SDKResultMessage | null = null;
    try {
        const stream = query({
            prompt: call.user,
            options: {
                systemPrompt: call.system,
                model: call.model,
                effort: call.effort as EffortLevel,
                tools: [],
                allowedTools: [],
                mcpServers: {},
                strictMcpConfig: true,
                settingSources: [],
                plugins: [],
                persistSession: false,
                maxTurns: call.maxTurns ?? 1,
                permissionMode: 'dontAsk',
                cwd: emptyCwd(),
                env: childEnv(DROPPED),
                abortController: abort,
                ...(call.schema === undefined ? {} : { outputFormat: { type: 'json_schema' as const, schema: call.schema } }),
            },
        });
        for await (const message of stream) {
            if (message.type === 'result') {
                result = message;
            } else if (message.type === 'rate_limit_event' && message.rate_limit_info.status !== 'allowed') {
                anomalies.push(`rate_limit_event:${message.rate_limit_info.status}`);
            } else if (message.type === 'system' && message.subtype === 'api_retry') {
                anomalies.push(`api_retry:${message.error}`);
            }
        }
    } catch (error) {
        const failure = failureOf(error);
        return { ...failedCall(failure.kind, failure.detail, Math.round(performance.now() - started)), anomalies };
    } finally {
        clearTimeout(timer);
    }
    const latency = Math.round(performance.now() - started);
    if (result === null) return { ...failedCall('failed', 'no result message', latency), anomalies };
    const usage = Object.values(result.modelUsage);
    const sum = (pick: (entry: (typeof usage)[number]) => number): number => usage.reduce((total, entry) => total + pick(entry), 0);
    const bases = [...new Set(usage.map((entry) => entry.costBasis ?? 'list'))];
    const success = result.subtype === 'success' && !result.is_error;
    const rateLimited = anomalies.some((anomaly) => anomaly.startsWith('rate_limit_event:rejected'));
    const detail = success ? null : `${result.subtype}: ${(result.subtype === 'success' ? [result.result] : result.errors).join('; ')}`.slice(0, 500);
    return {
        text: result.subtype === 'success' && success ? result.result : null,
        structured: result.subtype === 'success' && success ? result.structured_output : undefined,
        failure_kind: success ? null : rateLimited || /rate.?limit|\b429\b|usage limit|too many requests|overloaded/i.test(detail ?? '') ? 'rate_limit' : 'failed',
        failure_detail: detail,
        input_tokens: sum((entry) => entry.inputTokens + entry.cacheReadInputTokens + entry.cacheCreationInputTokens),
        cache_read_tokens: sum((entry) => entry.cacheReadInputTokens),
        cache_write_tokens: sum((entry) => entry.cacheCreationInputTokens),
        output_tokens: sum((entry) => entry.outputTokens),
        reasoning_tokens: sum((entry) => entry.thinkingTokens ?? 0),
        cost_usd: result.total_cost_usd,
        cost_basis: bases.join('+') || null,
        latency_ms: latency,
        models: Object.keys(result.modelUsage),
        anomalies: result.permission_denials.length > 0 ? [...anomalies, `permission_denials:${result.permission_denials.length}`] : anomalies,
    };
};
