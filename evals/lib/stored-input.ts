import type { InputAgent, RecapInput } from '../../packages/session-ledger/src/ports/recap-input.ts';
import type { RecapRequest } from '../../packages/session-ledger/src/ports/summarizer.ts';

export type StoredAgent = Omit<InputAgent, 'key'> & { readonly pane: InputAgent['key'] };

export type StoredRecapInput = Omit<RecapInput, 'scope' | 'agents'> & { readonly tab: RecapInput['scope']; readonly agents: readonly StoredAgent[] };

export type StoredRecapRequest = Omit<RecapRequest, 'input'> & { readonly input: StoredRecapInput };

const renamed = (from: string, to: string, value: object): Record<string, unknown> => Object.fromEntries(Object.entries(value).map(([name, each]) => [name === from ? to : name, each]));

export const agentOfStored = (agent: StoredAgent): InputAgent => renamed('pane', 'key', agent) as unknown as InputAgent;

export const agentToStored = (agent: InputAgent): StoredAgent => renamed('key', 'pane', agent) as unknown as StoredAgent;

export const inputOfStored = (input: StoredRecapInput): RecapInput => renamed('tab', 'scope', { ...input, agents: input.agents.map(agentOfStored) }) as unknown as RecapInput;

export const inputToStored = (input: RecapInput): StoredRecapInput => renamed('scope', 'tab', { ...input, agents: input.agents.map(agentToStored) }) as unknown as StoredRecapInput;

export const requestOfStored = (request: StoredRecapRequest): RecapRequest => ({ ...request, input: inputOfStored(request.input) });

export const requestToStored = (request: RecapRequest): StoredRecapRequest => ({ ...request, input: inputToStored(request.input) });
