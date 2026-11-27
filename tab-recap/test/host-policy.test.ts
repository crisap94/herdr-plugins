import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENGLISH, renderRefusal, supportOf } from '#src/host/policy.mjs';
import type { Platform, Refusal } from '#src/host/policy.mjs';
import { bunHost, platformOf } from '#src/host/bun-host.mjs';
import { en } from '#src/i18n/en.ts';
import { es } from '#src/i18n/es.ts';
import { textOf } from '@stateforge-labs/session-ledger';

test('the Host adapter reads the running Bun and names the OS family', () => {
    assert.equal(platformOf('darwin'), 'macos');
    assert.equal(platformOf('linux'), 'linux');
    assert.equal(platformOf('freebsd'), 'linux');
    assert.deepEqual(bunHost({ versions: { bun: '1.4.4' }, version: 'v26.3.0', execPath: '/b/bun', platform: 'darwin', env: { PATH: '/a:/b' } }),
        { bunVersion: '1.4.4', execPath: '/b/bun', platform: 'macos', path: '/a:/b' });
    assert.equal(bunHost({ versions: { bun: '1.4.4' }, version: 'v26.3.0', execPath: '/b/bun', platform: 'linux', env: {} }).path, '');
});

const PLATFORMS: readonly Platform[] = ['macos', 'linux'];

function refusal(platform: Platform, bunVersion = '1.0.0'): Refusal {
    const found = supportOf({ bunVersion, platform });
    if (found.ok) {
        assert.fail(`${bunVersion} should be refused`);
    }
    return found;
}

test('the catalogs render the same refusal in English and Spanish, for every platform', () => {
    for (const platform of PLATFORMS) {
        const found = refusal(platform);
        assert.equal(en.cli.hostRefusal(found, textOf('/usr/bin/bun')), renderRefusal(found, '/usr/bin/bun', ENGLISH));
        const spanish = es.cli.hostRefusal(found, textOf('/usr/bin/bun'));
        assert.match(spanish, /^tab-recap necesita Bun >= 1\.4\.4, pero este es 1\.0\.0 \(\/usr\/bin\/bun\)\.\nPara arreglarlo:\n  1\. Instala Bun >= 1\.4\.4 \(/);
        assert.equal(spanish.split('\n').length, en.cli.hostRefusal(found, textOf('/usr/bin/bun')).split('\n').length, 'the same steps');
    }
    assert.match(es.cli.hostRefusal(refusal('macos'), textOf('/n')), /launchctl setenv PATH/);
});

