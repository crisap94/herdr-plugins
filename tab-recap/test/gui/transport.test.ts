import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeApi } from './support/fake-api.ts';
import { fleet } from './support/fixture.ts';
import { reset } from './support/herdr.ts';
import { loadGui, storage } from './support/register.ts';

interface Reply {
    readonly status: number;
    readonly ok: boolean;
}

interface Client {
    api: {
        forget(): void;
        get(path: string): Promise<Reply | null>;
        post(path: string): Promise<Reply | null>;
        put(path: string): Promise<Reply | null>;
        del(path: string): Promise<Reply | null>;
    };
}

const client = await loadGui<Client>('api.js');
const TAB = '/v1/tabs/w1%3At1';
const ANSWER = `${TAB}/needs/n1/answer`;
const OPEN = `${TAB}/open`;
let served: FakeApi[] = [];

async function serve(): Promise<FakeApi> {
    const api = await FakeApi.start();
    served.push(api);
    api.tabs.set('w1:t1', '{}');
    api.advertise();
    return api;
}

const sent = (api: FakeApi, method: string, path: string): number => api.calls.filter((call) => call.method === method && call.path === path).length;

beforeEach(() => { reset(); storage.map.clear(); client.api.forget(); fleet(); served = []; });
afterEach(async () => { await Promise.all(served.map((api) => api.stop())); });

test('a GET that loses its connection once is read again and answers', async () => {
    const api = await serve();
    api.dropNext = 1;
    const reply = await client.api.get(TAB);
    assert.equal(reply?.ok, true);
    assert.equal(sent(api, 'GET', TAB), 2);
});

test('a GET that loses its connection twice gives up with nothing', async () => {
    const api = await serve();
    api.dropNext = 2;
    assert.equal(await client.api.get(TAB), null);
    assert.equal(sent(api, 'GET', TAB), 2);
});

test('a PUT and a DELETE that lose their connection once are sent again', async () => {
    const api = await serve();
    api.dropNext = 1;
    assert.equal((await client.api.put(OPEN))?.ok, true);
    assert.equal(sent(api, 'PUT', OPEN), 2);
    api.dropNext = 1;
    assert.equal((await client.api.del(OPEN))?.ok, true);
    assert.equal(sent(api, 'DELETE', OPEN), 2);
});

test('a POST that loses its connection is never sent again', async () => {
    const api = await serve();
    api.dropNext = 1;
    assert.equal(await client.api.post(ANSWER), null);
    assert.equal(sent(api, 'POST', ANSWER), 1);
    assert.deepEqual(api.answered, []);
});

test('a POST processed by the daemon whose reply is lost is sent once, not twice', async () => {
    const api = await serve();
    api.dropAfterAnswer = true;
    assert.equal(await client.api.post(ANSWER), null);
    assert.equal(sent(api, 'POST', ANSWER), 1);
    assert.equal(api.answered.length, 1);
});

test('a POST refused with 401 was not processed, so it is sent once more and lands', async () => {
    const api = await serve();
    api.unauthorizedNext = 1;
    const reply = await client.api.post(ANSWER);
    assert.equal(reply?.ok, true);
    assert.equal(sent(api, 'POST', ANSWER), 2);
    assert.equal(api.answered.length, 1);
});

test('a POST refused with 401 twice stops after the one retry', async () => {
    const api = await serve();
    api.unauthorizedNext = 2;
    assert.equal(await client.api.post(ANSWER), null);
    assert.equal(sent(api, 'POST', ANSWER), 2);
    assert.deepEqual(api.answered, []);
});
