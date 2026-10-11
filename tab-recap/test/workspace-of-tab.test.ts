import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tabId, workspaceOfTab } from '#src/recap/domain/ids.ts';

test('the workspace of a workspace-qualified tab id is the part before the colon', () => {
    assert.equal(workspaceOfTab(tabId('w1:t1')), 'w1');
    assert.equal(workspaceOfTab(tabId('w2J:t4')), 'w2J');
});

test('a malformed tab id has no workspace: no colon, an empty prefix or an empty suffix', () => {
    assert.equal(workspaceOfTab(tabId('w1')), null);
    assert.equal(workspaceOfTab(tabId(':t1')), null);
    assert.equal(workspaceOfTab(tabId('w1:')), null);
    assert.equal(workspaceOfTab(tabId(' :t1')), null);
    assert.equal(workspaceOfTab(tabId('w1: ')), null);
});
