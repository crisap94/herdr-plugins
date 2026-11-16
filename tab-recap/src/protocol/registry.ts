import { err, ok } from './result.ts';
import type { Result } from './result.ts';
import { LIMITS, parseCharCount, parseExchangeName, parseExchangeVersion, parseRefusalDetail } from './primitives.ts';
import type { CharCount, RefusalDetail, RequestPrefix, TokenName } from './primitives.ts';
import { answerToken, INTERRUPTED_REASON, terminalStage, terminalsOf } from './exchange.ts';
import type { Exchange } from './exchange.ts';

export type RegistryRefusal = {
    readonly reason: 'duplicate-name' | 'duplicate-prefix' | 'prefix-overlap' | 'bad-name' | 'bad-version' | 'name-too-long' | 'value-too-long' | 'too-many-own-names' | 'missing-interrupted';
    readonly detail: RefusalDetail;
};

export type Registry = {
    readonly exchanges: readonly Exchange[];
    readonly ownNames: readonly TokenName[];
};

const refusal = (reason: RegistryRefusal['reason'], detail: RefusalDetail): Result<never, RegistryRefusal> => err({ reason, detail });

const firstDuplicate = <T>(values: readonly T[]): T | null => values.find((value, at) => values.indexOf(value) !== at) ?? null;

const firstPrefixOfAnother = (prefixes: readonly RequestPrefix[]): RequestPrefix | null =>
    prefixes.find((prefix) => prefixes.some((other) => other !== prefix && other.startsWith(prefix))) ?? null;

function longestAnswer(exchange: Exchange): CharCount {
    const stages = exchange.answerStages.map((stage) => stage.length);
    const terminals = terminalsOf(exchange).map((terminal) => terminalStage(terminal).length);
    return parseCharCount(Math.max(0, ...stages, ...terminals));
}

function checkExchange(exchange: Exchange): Result<TokenName, RegistryRefusal> {
    if (parseExchangeName(exchange.name).kind === 'err') {
        return refusal('bad-name', parseRefusalDetail(exchange.name));
    }
    if (parseExchangeVersion(exchange.version).kind === 'err') {
        return refusal('bad-version', parseRefusalDetail(exchange.version));
    }
    if (!exchange.failureReasons.includes(INTERRUPTED_REASON)) {
        return refusal('missing-interrupted', parseRefusalDetail(exchange.name));
    }
    const answer = answerToken(exchange);
    if (answer.kind === 'err' || exchange.requestPrefix.length + LIMITS.toolMax > LIMITS.nameMax) {
        return refusal('name-too-long', parseRefusalDetail(exchange.name));
    }
    if (exchange.answerFit === 'whole' && LIMITS.idMax + 1 + longestAnswer(exchange) > LIMITS.valueMax) {
        return refusal('value-too-long', parseRefusalDetail(exchange.name));
    }
    return ok(answer.value);
}

export function buildRegistry(exchanges: readonly Exchange[], fixedOwnNames: readonly TokenName[]): Result<Registry, RegistryRefusal> {
    const duplicateName = firstDuplicate(exchanges.map((exchange) => exchange.name));
    if (duplicateName !== null) {
        return refusal('duplicate-name', parseRefusalDetail(duplicateName));
    }
    const prefixes = exchanges.map((exchange) => exchange.requestPrefix);
    const duplicatePrefix = firstDuplicate(prefixes);
    if (duplicatePrefix !== null) {
        return refusal('duplicate-prefix', parseRefusalDetail(duplicatePrefix));
    }
    const overlapping = firstPrefixOfAnother(prefixes);
    if (overlapping !== null) {
        return refusal('prefix-overlap', parseRefusalDetail(overlapping));
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
        return refusal('too-many-own-names', parseRefusalDetail(`${ownNames.length} names, at most ${LIMITS.ownNamesPerPane} per pane`));
    }
    return ok({ exchanges, ownNames });
}
