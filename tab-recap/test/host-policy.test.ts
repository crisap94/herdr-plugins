import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENGLISH, MIN_NODE, nodeAtLeast, renderRefusal, supportOf } from '#src/host/policy.mjs';
import type { Platform, Refusal } from '#src/host/policy.mjs';
import { nodeHost, platformOf } from '#src/host/node-host.mjs';
import { en } from '#src/i18n/en.ts';
import { es } from '#src/i18n/es.ts';

const PLATFORMS: readonly Platform[] = ['macos', 'linux', 'windows'];

function refusal(platform: Platform, nodeVersion = 'v20.11.0'): Refusal {
    const found = supportOf({ nodeVersion, platform });
    if (found.ok) {
        assert.fail(`${nodeVersion} should be refused`);
    }
    return found;
}

test('the minimum Node is 24.21.0 and the edges fall on either side of it', () => {
    assert.equal(MIN_NODE, '24.21.0');
    for (const platform of PLATFORMS) {
        assert.deepEqual(supportOf({ nodeVersion: 'v24.21.0', platform }), { ok: true });
        assert.deepEqual(supportOf({ nodeVersion: 'v25.0.0', platform }), { ok: true });
        assert.equal(supportOf({ nodeVersion: 'v24.20.0', platform }).ok, false);
        assert.equal(supportOf({ nodeVersion: 'v20.11.0', platform }).ok, false);
        assert.equal(supportOf({ nodeVersion: 'banana', platform }).ok, false);
        assert.equal(supportOf({ nodeVersion: '', platform }).ok, false);
    }
    assert.equal(nodeAtLeast('v24.21.1'), true);
});

test('a refusal names what was found, what is needed and the steps of that OS', () => {
    assert.deepEqual(refusal('macos', 'v24.20.0'), { ok: false, found: 'v24.20.0', needed: '24.21.0', platform: 'macos', steps: ['brew', 'mise', 'nvm', 'herdr-stop', 'new-terminal', 'launchctl-path'] });
    assert.deepEqual(refusal('linux').steps, ['nvm', 'mise', 'n', 'herdr-stop', 'new-terminal']);
    assert.deepEqual(refusal('windows').steps, ['winget', 'nvm-windows', 'restart-herdr']);
    assert.equal(refusal('freebsd' as Platform).platform, 'linux', 'an unknown OS gets the Linux steps');
});

const text = (platform: Platform): string => renderRefusal(refusal(platform), '/old/bin/node');

test('the English text (also the fallback of a Node that cannot load the catalogs) differs by platform', () => {
    for (const platform of PLATFORMS) {
        assert.match(text(platform), /^tab-recap needs Node >= 24\.21\.0, but this is v20\.11\.0 \(\/old\/bin\/node\)\.\nTo fix it:\n  1\. Install Node >= 24\.21\.0 \(/);
    }
    assert.match(text('macos'), /brew install node · mise use -g node@24 · nvm install 24/);
    assert.match(text('macos'), /launchctl setenv PATH/);
    assert.match(text('linux'), /nvm install 24 · mise use -g node@24 · n 24/);
    assert.doesNotMatch(text('linux'), /brew|launchctl/);
    assert.match(text('windows'), /winget install OpenJS\.NodeJS/);
    assert.doesNotMatch(text('windows'), /herdr server stop/);
    assert.match(text('linux'), /\n  2\. Run: herdr server stop\n  3\. Open a new terminal/);
});

test('the catalogs render the same refusal in English and Spanish, for every platform', () => {
    for (const platform of PLATFORMS) {
        const found = refusal(platform);
        assert.equal(en.cli.hostRefusal(found, '/usr/bin/node'), renderRefusal(found, '/usr/bin/node', ENGLISH));
        const spanish = es.cli.hostRefusal(found, '/usr/bin/node');
        assert.match(spanish, /^tab-recap necesita Node >= 24\.21\.0, pero este es v20\.11\.0 \(\/usr\/bin\/node\)\.\nPara arreglarlo:\n  1\. Instala Node >= 24\.21\.0 \(/);
        assert.equal(spanish.split('\n').length, en.cli.hostRefusal(found, '/usr/bin/node').split('\n').length, 'the same steps');
    }
    assert.match(es.cli.hostRefusal(refusal('macos'), '/n'), /launchctl setenv PATH/);
    assert.match(es.cli.hostRefusal(refusal('windows'), '/n'), /winget install/);
});

test('the Host adapter reads the running Node and names the OS family', () => {
    assert.equal(platformOf('darwin'), 'macos');
    assert.equal(platformOf('win32'), 'windows');
    assert.equal(platformOf('linux'), 'linux');
    assert.equal(platformOf('freebsd'), 'linux');
    assert.deepEqual(nodeHost({ version: 'v24.21.0', execPath: '/n/node', platform: 'darwin', env: { PATH: '/a:/b' } }),
        { nodeVersion: 'v24.21.0', execPath: '/n/node', platform: 'macos', path: '/a:/b' });
    assert.equal(nodeHost({ version: 'v1.0.0', execPath: '', platform: 'linux', env: {} }).path, '');
});
