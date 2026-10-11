import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAPABILITY_TOKEN, capabilityValue, parseCapability } from '#src/protocol/capability.ts';
import { ownerTable } from '#src/protocol/owners.ts';
import { exchangeName, exchangeVersion, tokenName } from '#src/protocol/primitives.ts';
import type { ExchangeVersion } from '#src/protocol/primitives.ts';
import type { Exchange } from '#src/protocol/exchange.ts';
import { compactLike, handoffLike, nameOf, registryOf, unwrap } from './fakes/protocol-exchanges.ts';

const version = (n: number): ExchangeVersion => unwrap(exchangeVersion(n));

const renamed = (exchange: Exchange, name: string, n: number): Exchange => ({ ...exchange, name: unwrap(exchangeName(name)), version: version(n) });

test('the capability token name is a valid token name', () => {
    assert.equal(tokenName(CAPABILITY_TOKEN).kind, 'ok');
});

test('the capability value for compact alone is compact1 with the kinds version', () => {
    assert.equal(unwrap(capabilityValue([compactLike], version(1))), 'compact1,kinds1');
});

test('the capability value lists exchanges in registry order, then the kinds version', () => {
    assert.equal(unwrap(capabilityValue([compactLike, handoffLike], version(1))), 'compact1,handoff1,kinds1');
    assert.equal(unwrap(capabilityValue([handoffLike, compactLike], version(1))), 'handoff1,compact1,kinds1');
});

test('with no exchange enabled the capability value is the kinds version alone', () => {
    assert.equal(unwrap(capabilityValue([], version(1))), 'kinds1');
});

test('a two-digit version is written in full', () => {
    assert.equal(unwrap(capabilityValue([renamed(handoffLike, 'handoff', 12)], version(3))), 'handoff12,kinds3');
});

test('an exchange whose name ends in a digit is refused, since its entry could not be read back', () => {
    assert.equal(capabilityValue([renamed(compactLike, 'v2', 1)], version(1)).kind, 'err');
});

test('an exchange named kinds is refused, since its entry would read as the kinds entry', () => {
    assert.equal(capabilityValue([renamed(compactLike, 'kinds', 1)], version(1)).kind, 'err');
});

test('a capability value parses back to the exchanges and kinds it was written from', () => {
    const cases: readonly (readonly [readonly Exchange[], number])[] = [
        [[compactLike], 1],
        [[compactLike, handoffLike], 1],
        [[renamed(handoffLike, 'handoff-next', 12), compactLike], 7],
        [[], 1],
    ];
    for (const [exchanges, kinds] of cases) {
        const value = unwrap(capabilityValue(exchanges, version(kinds)));
        assert.deepEqual(unwrap(parseCapability(value)), {
            exchanges: exchanges.map((exchange) => ({ name: exchange.name, version: exchange.version })),
            kinds,
        });
    }
});

test('a capability value with a malformed entry is refused', () => {
    for (const raw of ['', 'Compact1,kinds1', 'compact,kinds1', 'compact1,kinds', 'compact1,kinds1,kinds2', 'compact01,kinds1']) {
        assert.equal(parseCapability(raw).kind, 'err', raw);
    }
});

test('the owner table lists the registry own names and each exchange request prefix', () => {
    const registry = registryOf([compactLike, handoffLike]);
    const owners = ownerTable(registry);
    assert.deepEqual(owners.writable, [CAPABILITY_TOKEN, nameOf('tab-recap-compact'), nameOf('tab-recap-handoff')]);
    assert.deepEqual(owners.readPrefixes, ['compact-req-', 'handoff-req-']);
});

test('an exchange whose switch is off is not advertised, and is advertised once the switch is on', () => {
    const switched: Exchange = { ...handoffLike, optIn: 'TAB_RECAP_HANDOFF' };
    assert.equal(unwrap(capabilityValue([compactLike, switched], version(1), () => false)), 'compact1,kinds1');
    assert.equal(unwrap(capabilityValue([compactLike, switched], version(1), (setting) => setting === 'TAB_RECAP_HANDOFF')), 'compact1,handoff1,kinds1');
});

test('an exchange with no switch is always advertised', () => {
    assert.equal(unwrap(capabilityValue([compactLike], version(1), () => false)), 'compact1,kinds1');
});
