import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Commands } from './support/api.ts';
import { fleet } from './support/fixture.ts';
import { reset, world, type ExecCall, type Reply } from './support/herdr.ts';
import { mount } from './support/mount.ts';
import { loadGui, settle, storage } from './support/register.ts';
import { byId, click, hasId, press, text } from './support/tree.ts';

interface Constants {
    COMMANDS: Record<string, string>;
    SYSTEM: Record<string, string>;
    DEFAULT_BIN: string;
}

const constants = await loadGui<Constants>('constants.js');
const commands = await loadGui<Commands>('commands.js');
const BIN = constants.DEFAULT_BIN;
const SHOP = 'w1:t1';
const MARKER = '/state/gui/open.w1%3At1';
const HOSTILE = ['x;rm -rf /', '$(reboot)', 'a b', '', 'a`b`', "a'b", 'a\nb', '../etc', 'a/b', 'a|b', 'a&b', '-x', '--help'];

const ensureFails = (name: string, argv: readonly string[]): Reply | null => (name === BIN && argv[0] === 'ensure' ? { code: 1, stdout: '', stderr: '' } : null);
const succeeds = (): Reply | null => null;
const explodes = (): never => { throw new Error('boom'); };
const allowed = new Set([constants.SYSTEM['printenv'], constants.SYSTEM['touch'], constants.SYSTEM['rm'], constants.SYSTEM['opener'], BIN]);
const desk = (): ExecCall[] => world.execLog.filter((call) => call.command === BIN);
const touches = (): number => world.execLog.filter((call) => call.command === 'touch').length;

test.beforeEach(() => { reset(); storage.map.clear(); fleet(); });

test('every exec carries an argv array and starts with a constant command', async () => {
    const view = await mount({ role: 'brief', tab: SHOP });
    press(view.render(), 'r', view.cx);
    press(view.render(), 'escape', view.cx);
    press(view.render(), 'r', view.cx);
    await settle();
    assert.ok(world.execLog.length > 0);
    for (const call of world.execLog) {
        assert.ok(Array.isArray(call.argv), call.command);
        assert.ok(allowed.has(call.command), call.command);
    }
    const words = new Set(Object.values(constants.COMMANDS));
    for (const call of desk()) {
        assert.ok(words.has(call.argv[0] ?? ''), `${call.argv[0]}`);
    }
});

test('the daemon is ensured once when a window opens', async () => {
    await mount({ role: 'fleet' });
    assert.deepEqual(desk().map((call) => call.argv), [['ensure']]);
});

test('a tab id that fails validation never reaches exec, whatever the entry point', async () => {
    for (const bad of HOSTILE) {
        assert.equal(commands.safe(bad), false, bad);
        await commands.refreshTab(bad);
        await commands.touchMarker(bad);
        await commands.clearMarker(bad);
        commands.jumpToLane(bad, 'w1:p1');
    }
    assert.equal(commands.safe(undefined), false);
    assert.equal(commands.safe(42), false);
    assert.deepEqual(world.execLog.filter((call) => call.command !== 'printenv'), []);
    assert.deepEqual(world.runLog, []);
});

test('a brief opened for a hostile tab id touches nothing and refreshes nothing', async () => {
    const view = await mount({ role: 'brief', tab: 'x;rm -rf /' });
    press(view.render(), 'r', view.cx);
    await view.close();
    await settle();
    assert.doesNotMatch(JSON.stringify(world.execLog), /rm -rf|reboot/);
    assert.deepEqual(world.execLog.filter((call) => call.command === 'touch' || call.command === 'rm'), []);
    assert.deepEqual(desk().filter((call) => call.argv[0] === 'refresh'), []);
});

test('valid ids pass, and the marker path encodes the id', async () => {
    assert.equal(commands.safe('w1:t1'), true);
    assert.equal(commands.safe('1-2'), true);
    await commands.touchMarker('w1:t1');
    assert.deepEqual(world.execLog.at(-1), { command: 'touch', argv: [MARKER] });
});

test('the open marker is touched on open and then on an interval while the brief is open', async () => {
    const view = await mount({ role: 'brief', tab: SHOP });
    await settle();
    assert.equal(touches(), 1);
    assert.ok(view.cx.intervals().includes(20_000));
    view.cx.advance(20_000);
    await settle();
    assert.equal(touches(), 2);
    view.cx.advance(60_000);
    await settle();
    assert.equal(touches(), 5);
    assert.ok(world.execLog.filter((call) => call.command === 'touch').every((call) => call.argv.length === 1 && call.argv[0] === MARKER));
});

test('leaving the brief removes the marker and stops touching', async () => {
    const view = await mount({ role: 'brief', tab: SHOP });
    press(view.render(), 'escape', view.cx);
    await settle();
    assert.deepEqual(world.execLog.filter((call) => call.command === 'rm'), [{ command: 'rm', argv: ['-f', MARKER] }]);
    const before = touches();
    view.cx.advance(100_000);
    await settle();
    assert.equal(touches(), before);
});

test('closing the window while a brief is open removes the marker', async () => {
    const view = await mount({ role: 'brief', tab: SHOP });
    await view.close();
    assert.deepEqual(world.execLog.filter((call) => call.command === 'rm').map((call) => call.argv), [['-f', MARKER]]);
});

test('r refreshes the open tab, and in the fleet refreshes every tab that is not idle', async () => {
    const view = await mount({ role: 'brief', tab: SHOP });
    press(view.render(), 'r', view.cx);
    await settle();
    assert.deepEqual(desk().filter((call) => call.argv[0] === 'refresh').map((call) => call.argv), [['refresh', SHOP]]);
    reset();
    fleet();
    const list = await mount({ role: 'fleet' });
    press(list.render(), 'r', list.cx);
    await settle();
    assert.deepEqual(desk().filter((call) => call.argv[0] === 'refresh').map((call) => call.argv[1]), ['w1:t2', SHOP, 'w1:t3']);
});

test('refreshing all tabs is capped at eight', async () => {
    world.spaces = [{ id: 's1', name: 'work', tabs: Array.from({ length: 10 }, (_, index) => ({ id: `w2:t${index}`, name: `n${index}`, status: 'working' })) }];
    const list = await mount({ role: 'fleet' });
    press(list.render(), 'r', list.cx);
    await settle();
    assert.equal(desk().filter((call) => call.argv[0] === 'refresh').length, 8);
});

test('the refresh button shows Refreshing until it settles', async () => {
    const view = await mount({ role: 'brief', tab: SHOP });
    assert.match(text(byId(view.render(), 'refresh')), /Refresh$/);
    click(byId(view.render(), 'refresh'), view.cx);
    assert.match(text(byId(view.render(), 'refresh')), /Refreshing/);
    world.now += 8000;
    view.cx.advance(8000);
    assert.match(text(byId(view.render(), 'refresh')), /Refresh$/);
    await settle();
});

test('a down daemon shows a line with Restart, which stops, starts and ensures through argv arrays', async () => {
    world.execReply = ensureFails;
    const view = await mount({ role: 'brief', tab: SHOP });
    assert.match(text(byId(view.render(), 'n-down')), /not running/);
    world.execReply = succeeds;
    click(byId(view.render(), 'restart'), view.cx);
    await settle();
    assert.deepEqual(desk().map((call) => call.argv), [['ensure'], ['stop'], ['start'], ['ensure']]);
    assert.equal(hasId(view.render(), 'n-down'), false);
});

test('links open only with http or https, through xdg-open and an argv array', () => {
    commands.openLink('javascript:alert(1)');
    commands.openLink('file:///etc/passwd');
    commands.openLink(null);
    commands.openLink('https://git.example/x?a=1&b=2');
    assert.deepEqual(world.execLog, [{ command: 'xdg-open', argv: ['https://git.example/x?a=1&b=2'] }]);
});

test('an exec that rejects is swallowed', async () => {
    const view = await mount({ role: 'brief', tab: SHOP });
    world.execReply = explodes;
    await assert.doesNotReject(commands.touchMarker('w1:t1'));
    await assert.doesNotReject(commands.refreshTab('w1:t1'));
    assert.ok(view.render());
});

test('opening a second tab clears the first marker before it touches the second', async () => {
    const view = await mount({ role: 'fleet', overlay: 'win-1' });
    press(view.render(), 'enter', view.cx);
    await settle();
    press(view.render(), 'escape', view.cx);
    press(view.render(), 'j', view.cx);
    press(view.render(), 'enter', view.cx);
    await settle();
    const marks = world.execLog.filter((call) => call.command === 'touch' || call.command === 'rm');
    const last = marks.slice(-2);
    assert.deepEqual(last.map((call) => call.command), ['rm', 'touch']);
    assert.notDeepEqual(last.map((call) => call.argv).at(-1), [MARKER]);
});
