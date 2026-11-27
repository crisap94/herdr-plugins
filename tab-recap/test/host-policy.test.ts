import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bunHost, platformOf } from '#src/host/bun-host.mjs';

test('the Host adapter reads the running Bun and names the OS family', () => {
    assert.equal(platformOf('darwin'), 'macos');
    assert.equal(platformOf('linux'), 'linux');
    assert.equal(platformOf('freebsd'), 'linux');
    assert.deepEqual(bunHost({ versions: { bun: '1.4.4' }, version: 'v26.3.0', execPath: '/b/bun', platform: 'darwin', env: { PATH: '/a:/b' } }),
        { bunVersion: '1.4.4', execPath: '/b/bun', platform: 'macos', path: '/a:/b' });
    assert.equal(bunHost({ versions: { bun: '1.4.4' }, version: 'v26.3.0', execPath: '/b/bun', platform: 'linux', env: {} }).path, '');
});
