import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENGLISH, MIN_BUN, bunAtLeast, renderRefusal, supportOf } from '#src/host/policy.mjs';
import type { Platform, Refusal } from '#src/host/policy.mjs';
import { bunHost, platformOf } from '#src/host/bun-host.mjs';
import { en } from '#src/i18n/en.ts';
import { es } from '#src/i18n/es.ts';

const PLATFORMS: readonly Platform[] = ['macos', 'linux', 'windows'];

function refusal(platform: Platform, bunVersion = '1.0.0'): Refusal {
    const found = supportOf({ bunVersion, platform });
    if (found.ok) {
        assert.fail(`${bunVersion} should be refused`);
    }
    return found;
}

test('the minimum Bun is 1.4.4 and the edges fall on either side of it', () => {
    assert.equal(MIN_BUN, '1.4.4');
    for (const platform of PLATFORMS) {
        assert.deepEqual(supportOf({ bunVersion: '1.4.4', platform }), { ok: true });
        assert.deepEqual(supportOf({ bunVersion: '1.5.0', platform }), { ok: true });
        assert.equal(supportOf({ bunVersion: '1.4.3', platform }).ok, false);
        assert.equal(supportOf({ bunVersion: '0.9.0', platform }).ok, false);
        assert.equal(supportOf({ bunVersion: 'banana', platform }).ok, false);
        assert.equal(supportOf({ bunVersion: '', platform }).ok, false);
    }
    assert.equal(bunAtLeast('1.4.4'), true);
    assert.equal(bunAtLeast('1.4.3'), false);
});

test('a refusal names what was found, what is needed and the steps of that OS', () => {
    assert.deepEqual(refusal('macos', '1.0.0'), { ok: false, found: '1.0.0', needed: '1.4.4', platform: 'macos', steps: ['brew', 'mise', 'curl', 'herdr-stop', 'new-terminal', 'launchctl-path'] });
    assert.deepEqual(refusal('linux').steps, ['curl', 'mise', 'herdr-stop', 'new-terminal']);
    assert.deepEqual(refusal('windows').steps, ['powershell', 'restart-herdr']);
    assert.equal(refusal('freebsd' as Platform).platform, 'linux', 'an unknown OS gets the Linux steps');
});

const text = (platform: Platform): string => renderRefusal(refusal(platform), '/old/bin/bun');

test('the English text (also the fallback of a Bun that cannot load the catalogs) differs by platform', () => {
    for (const platform of PLATFORMS) {
        assert.match(text(platform), /^tab-recap needs Bun >= 1\.4\.4, but this is 1\.0\.0 \(\/old\/bin\/bun\)\.\nTo fix it:\n  1\. Install Bun >= 1\.4\.4 \(/);
    }
    assert.match(text('macos'), /brew install oven-sh\/bun\/bun · mise use -g bun@latest · curl -fsSL https:\/\/bun\.sh\/install \| bash/);
    assert.match(text('macos'), /launchctl setenv PATH/);
    assert.match(text('linux'), /curl -fsSL https:\/\/bun\.sh\/install \| bash · mise use -g bun@latest/);
    assert.doesNotMatch(text('linux'), /brew|launchctl/);
    assert.match(text('windows'), /powershell -c "irm bun\.sh\/install\.ps1 \| iex"/);
    assert.doesNotMatch(text('windows'), /herdr server stop/);
    assert.match(text('linux'), /\n  2\. Run: herdr server stop\n  3\. Open a new terminal, check that `bun --version` prints 1\.4\.4 or newer/);
});

test('the catalogs render the same refusal in English and Spanish, for every platform', () => {
    for (const platform of PLATFORMS) {
        const found = refusal(platform);
        assert.equal(en.cli.hostRefusal(found, '/usr/bin/bun'), renderRefusal(found, '/usr/bin/bun', ENGLISH));
        const spanish = es.cli.hostRefusal(found, '/usr/bin/bun');
        assert.match(spanish, /^tab-recap necesita Bun >= 1\.4\.4, pero este es 1\.0\.0 \(\/usr\/bin\/bun\)\.\nPara arreglarlo:\n  1\. Instala Bun >= 1\.4\.4 \(/);
        assert.equal(spanish.split('\n').length, en.cli.hostRefusal(found, '/usr/bin/bun').split('\n').length, 'the same steps');
    }
    assert.match(es.cli.hostRefusal(refusal('macos'), '/n'), /launchctl setenv PATH/);
    assert.match(es.cli.hostRefusal(refusal('windows'), '/n'), /powershell -c/);
});

test('the Host adapter reads the running Bun and names the OS family', () => {
    assert.equal(platformOf('darwin'), 'macos');
    assert.equal(platformOf('win32'), 'windows');
    assert.equal(platformOf('linux'), 'linux');
    assert.equal(platformOf('freebsd'), 'linux');
    assert.deepEqual(bunHost({ versions: { bun: '1.4.4' }, version: 'v26.3.0', execPath: '/b/bun', platform: 'darwin', env: { PATH: '/a:/b' } }),
        { bunVersion: '1.4.4', execPath: '/b/bun', platform: 'macos', path: '/a:/b' });
    assert.equal(bunHost({ versions: { bun: '1.4.4' }, version: 'v26.3.0', execPath: '/b/bun', platform: 'linux', env: {} }).path, '');
});

test('a Node that runs the launchers is not a Bun and is refused', () => {
    const host = bunHost({ versions: {}, version: 'v24.21.0', execPath: '/n/node', platform: 'linux', env: { PATH: '/x' } });
    assert.deepEqual(host, { bunVersion: 'node v24.21.0', execPath: '/n/node', platform: 'linux', path: '/x' });
    assert.equal(supportOf({ bunVersion: host.bunVersion, platform: host.platform }).ok, false);
});
