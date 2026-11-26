import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { judgingWorld, type EvalWorld } from '../support/eval-world.ts';
import { FILE } from '../support/replay-world.ts';

const CONFIG = 'config/config.env';
const CLEAR = { TAB_RECAP_RECAP_LANG: '', TAB_RECAP_LOCALE: '', LC_ALL: '', LANG: '', LANGUAGE: '' };
const ENGLISH = 'Write every text and why in English.';
const SPANISH = 'Write every text and why in Spanish (neutral Latin American, informal "tú").';

const lineOf = (text: string, name: string): string => text.split('\n').find((line) => line.startsWith(`${name} `))?.slice(name.length).trim() ?? '';

describe('the user changes the recap language to Spanish', () => {
    let world: EvalWorld;

    const statusOf = async (name: string, env: Readonly<Record<string, string>> = {}): Promise<string> => {
        const ran = await world.run(['status'], { env: { ...CLEAR, ...env } });
        assert.equal(ran.code, 0, ran.stderr);
        return lineOf(ran.stdout, name);
    };
    const replay = async (env: Readonly<Record<string, string>> = {}): Promise<string> => {
        world.forget();
        world.answer('writer', JSON.stringify({ ops: [] }));
        const ran = await world.run(['eval', '--replay', FILE, '--pipeline', 'one'], { env: { ...CLEAR, ...env } });
        assert.equal(ran.code, 0, ran.stderr);
        return world.seen('writer', 1);
    };

    before(() => {
        world = judgingWorld();
    });

    after(() => {
        world.close();
    });

    test('before the change the writer is asked in English and status names the environment', { timeout: 30_000 }, async () => {
        assert.equal(await statusOf('language', { TAB_RECAP_LOCALE: 'en' }), 'en (environment variable)');
        const asked = await replay({ TAB_RECAP_LOCALE: 'en' });
        assert.ok(asked.includes(ENGLISH));
        assert.ok(!asked.includes('in Spanish'));
    });

    test('after the change status names the settings file as the source', { timeout: 30_000 }, async () => {
        world.write(CONFIG, 'TAB_RECAP_RECAP_LANG=es\n');
        assert.equal(await statusOf('language', { TAB_RECAP_LOCALE: 'en' }), 'es (settings file)');
    });

    test('the next run is asked in Spanish, with no restart', { timeout: 30_000 }, async () => {
        const asked = await replay({ TAB_RECAP_LOCALE: 'en' });
        assert.ok(asked.includes(SPANISH));
        assert.ok(!asked.includes(ENGLISH));
    });

    test('the settings file wins over the environment for the recap language, and the environment fills what the file lacks', { timeout: 30_000 }, async () => {
        assert.equal(await statusOf('language', { TAB_RECAP_RECAP_LANG: 'fr' }), 'es (settings file)');
        world.write(CONFIG, '');
        assert.equal(await statusOf('language', { TAB_RECAP_RECAP_LANG: 'fr' }), 'fr (environment variable)');
    });

    test('free text from the environment is sanitised to its letters', { timeout: 30_000 }, async () => {
        assert.equal(await statusOf('language', { TAB_RECAP_RECAP_LANG: 'Deutsch!!' }), 'Deutsch (environment variable)');
    });

    test('with no language set anywhere the system language is followed, and auto in the file says so', { timeout: 30_000 }, async () => {
        assert.equal(await statusOf('idioma', { LC_ALL: 'es_CL.UTF-8' }), 'es (idioma del sistema)');
        world.write(CONFIG, 'TAB_RECAP_LOCALE=auto\n');
        assert.equal(await statusOf('idioma', { LC_ALL: 'es_CL.UTF-8', TAB_RECAP_LOCALE: 'en' }), 'es (idioma del sistema)');
    });

    test('the interface headings follow the interface language, and the recap language follows it unless set', { timeout: 30_000 }, async () => {
        world.write(CONFIG, 'TAB_RECAP_LOCALE=es\n');
        assert.equal(await statusOf('idioma', { TAB_RECAP_LOCALE: 'en' }), 'es (archivo de ajustes)');
        const ran = await world.run(['status'], { env: CLEAR });
        assert.match(ran.stdout, /^\s*versión/m);
        assert.match(ran.stdout, /^estado\s/m);
        assert.ok((await replay()).includes(SPANISH));
        world.write(CONFIG, 'TAB_RECAP_LOCALE=en\nTAB_RECAP_RECAP_LANG=es\n');
        const mixed = await world.run(['status'], { env: CLEAR });
        assert.match(mixed.stdout, /^language\s+es \(settings file\)$/m);
        assert.match(mixed.stdout, /^state\s/m);
    });
});
