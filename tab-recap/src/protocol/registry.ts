import { err, ok } from './result.ts';
import type { Result } from './result.ts';
import { LIMITS, exchangeName, exchangeVersion } from './primitives.ts';
import type { TokenName } from './primitives.ts';
import { answerToken, failureStage } from './exchange.ts';
import type { Exchange } from './exchange.ts';

export type RegistryRefusal = {
    readonly reason: 'duplicate-name' | 'duplicate-prefix' | 'prefix-overlap' | 'bad-name' | 'bad-version' | 'name-too-long' | 'value-too-long' | 'too-many-own-names';
    readonly detail: string;
};

export type Registry = {
    readonly exchanges: readonly Exchange[];
    readonly ownNames: readonly TokenName[];
};

const refusal = (reason: RegistryRefusal['reason'], detail: string): Result<never, RegistryRefusal> => err({ reason, detail });

const firstDuplicate = (values: readonly string[]): string | null => values.find((value, at) => values.indexOf(value) !== at) ?? null;

const firstPrefixOfAnother = (prefixes: readonly string[]): string | null =>
    prefixes.find((prefix) => prefixes.some((other) => other !== prefix && other.startsWith(prefix))) ?? null;

function longestAnswer(exchange: Exchange): number {
    const stages = exchange.answerStages.map((stage) => stage.length);
    const failures = exchange.failureReasons.map((reason) => failureStage(reason).length);
    return Math.max(0, ...stages, ...failures);
}

function checkExchange(exchange: Exchange): Result<TokenName, RegistryRefusal> {
    if (exchangeName(exchange.name).kind === 'err') {
        return refusal('bad-name', exchange.name);
    }
    if (exchangeVersion(exchange.version).kind === 'err') {
        return refusal('bad-version', String(exchange.version));
    }
    const answer = answerToken(exchange);
    if (answer.kind === 'err' || exchange.requestPrefix.length + LIMITS.toolMax > LIMITS.nameMax) {
        return refusal('name-too-long', exchange.name);
    }
    if (!exchange.truncatesAnswer && LIMITS.idMax + 1 + longestAnswer(exchange) > LIMITS.valueMax) {
        return refusal('value-too-long', exchange.name);
    }
    return ok(answer.value);
}

export function buildRegistry(exchanges: readonly Exchange[], fixedOwnNames: readonly TokenName[]): Result<Registry, RegistryRefusal> {
    const duplicateName = firstDuplicate(exchanges.map((exchange) => exchange.name));
    if (duplicateName !== null) {
        return refusal('duplicate-name', duplicateName);
    }
    const prefixes = exchanges.map((exchange) => exchange.requestPrefix);
    const duplicatePrefix = firstDuplicate(prefixes);
    if (duplicatePrefix !== null) {
        return refusal('duplicate-prefix', duplicatePrefix);
    }
    const overlapping = firstPrefixOfAnother(prefixes);
    if (overlapping !== null) {
        return refusal('prefix-overlap', overlapping);
    }
    const answers: TokenName[] = [];
    for (const exchange of exchanges) {
        const checked = checkExchange(exchange);
        if (checked.kind === 'err') {
            return checked;
        }
        answers.push(checked.value);
    }
    const ownNames = [...fixedOwnNames, ...answers];
    if (ownNames.length > LIMITS.ownNamesPerPane) {
        return refusal('too-many-own-names', `${ownNames.length} names, at most ${LIMITS.ownNamesPerPane} per pane`);
    }
    return ok({ exchanges, ownNames });
}
