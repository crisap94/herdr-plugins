import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clipName, sessionName, storyTitle } from 'herdr-desktop-mods/tab-recap/naming';

const story = (text: string, at: number): { story: { text: string; at: number } } => ({ story: { text, at } });

test('the title is the first sentence of the latest story', () => {
    const tasks = [story('Old work on the parser. More words.', 10), story('Wiring the settings page. It talks to the daemon.', 20)];
    assert.equal(storyTitle(tasks), 'Wiring the settings page');
});

test('a story with no sentence end is taken whole and clipped', () => {
    const long = 'Migrating the whole recap pipeline from the old queue to the new database tables safely';
    const title = storyTitle([story(long, 1)]);
    assert.ok(Array.from(title).length <= 48);
    assert.ok(title.endsWith('…'));
    assert.ok(long.startsWith(title.slice(0, -1)));
});

test('clipping cuts at a word and never past the limit', () => {
    assert.equal(clipName('short'), 'short');
    assert.ok(Array.from(clipName('word '.repeat(30))).length <= 48);
    assert.equal(clipName('  spaced \n out  '), 'spaced out');
});

test('no story: the recap topic, then the agent title, then the label, then the id', () => {
    const base = { agentTitle: 'Agent title', label: 'Label', id: 'tab-1' };
    assert.equal(sessionName({ ...base, tasks: [], topic: 'Topic' }), 'Topic');
    assert.equal(sessionName({ ...base, tasks: null, topic: 'tab-1' }), 'Agent title');
    assert.equal(sessionName({ ...base, agentTitle: '', topic: '' }), 'Label');
    assert.equal(sessionName({ id: 'tab-1', topic: 'tab-1' }), 'tab-1');
});

test('a story wins over everything else', () => {
    assert.equal(sessionName({ tasks: [story('Fixing the login. Done soon.', 5)], topic: 'Topic', agentTitle: 'A', label: 'L', id: 'x' }), 'Fixing the login');
});

test('a story with only blanks does not count', () => {
    assert.equal(sessionName({ tasks: [story('   ', 5)], topic: 'Topic', id: 'x' }), 'Topic');
});
