import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { evalWorld, type EvalWorld } from '../support/eval-world.ts';

const PLUGIN = join(import.meta.dirname, '..', '..', '..');
const VERSION = /^version\s*=\s*"(\d+\.\d+\.\d+)"/mu.exec(readFileSync(join(PLUGIN, 'herdr-plugin.toml'), 'utf8'))?.[1] ?? '';
const BLANK = {
    TAB_RECAP_BACKEND: '', TAB_RECAP_RECAP_LANG: '', TAB_RECAP_LOCALE: '', TAB_RECAP_MODEL_CLAUDE: '', TAB_RECAP_MODEL_CODEX: '',
    LC_ALL: '', LC_MESSAGES: '', LANG: '', HERDR_CONFIG_PATH: '',
};
const BUN = `${process.execPath} ${process.versions.bun}`;

describe('status in English and in Spanish', () => {
    let world: EvalWorld;
    let keys = '';
    let looked = '';

    const status = async (env: Readonly<Record<string, string>> = {}): Promise<string[]> => {
        const ran = await world.run(['status'], { env: { ...BLANK, ...env } });
        assert.equal(ran.code, 0, ran.stderr);
        assert.equal(ran.stderr, '');
        return ran.stdout.split('\n').filter((line) => line !== '');
    };

    before(() => {
        world = evalWorld({ judge: 'none' });
        keys = world.write('herdr/config.toml', '[[keys.command]]\nkey = "prefix+r"\ncommand = "tab-recap.column"\n\n[[keys.command]]\nkey = "ctrl+alt+r"\ncommand = "tab-recap.columns"\n\n[[keys.command]]\nkey = "prefix+x"\ncommand = "other.thing"\n');
        looked = join(world.home, '.config', 'herdr', 'config.toml');
    });

    after(() => {
        world.close();
    });

    test('in English it prints nine lines in order: version, bun, keys, daemon, backend, language, extensions, state, config', { timeout: 30_000 }, async () => {
        const lines = await status();
        assert.equal(lines.length, 9);
        assert.deepEqual(lines.map((line) => line.split(/\s+/)[0]), ['version', 'bun', 'keys', 'daemon', 'backend', 'language', 'extensions', 'state', 'config']);
        assert.equal(lines[0], `version  ${VERSION}`);
        assert.equal(lines[1], `bun      ${BUN}`);
        assert.equal(lines[3], 'daemon   not running');
        assert.equal(lines[4], 'backend  auto (claude → codex → opencode)');
        assert.equal(lines[6], 'extensions stored-notes');
    });

    test('with no key bound it says where it looked', { timeout: 30_000 }, async () => {
        const lines = await status();
        assert.equal(lines[2], `keys     no key bound — see README (looked in ${looked})`);
    });

    test('with keys bound in the herdr config it lists only the tab-recap ones', { timeout: 30_000 }, async () => {
        const lines = await status({ HERDR_CONFIG_PATH: keys });
        assert.equal(lines[2], 'keys     prefix+r → tab-recap.column, ctrl+alt+r → tab-recap.columns');
    });

    test('in Spanish every line is in Spanish and the paths and the version are the same', { timeout: 30_000 }, async () => {
        const english = await status();
        const spanish = await status({ TAB_RECAP_LOCALE: 'es' });
        assert.deepEqual(spanish.map((line) => line.split(/\s+/)[0]), ['versión', 'bun', 'teclas', 'daemon', 'motor', 'idioma', 'extensiones', 'estado', 'config']);
        assert.equal(spanish[0], `versión  ${VERSION}`);
        assert.equal(spanish[1], english[1]);
        assert.equal(spanish[2], `teclas   ninguna tecla asignada — mira el README (se buscó en ${looked})`);
        assert.equal(spanish[3], 'daemon   detenido');
        assert.equal(spanish[4], 'motor    auto (claude → codex → opencode)');
        assert.equal(spanish[6], 'extensiones stored-notes');
        assert.equal(spanish[7]?.slice('estado  '.length), english[7]?.slice('state   '.length));
        assert.equal(spanish[8], english[8]);
    });

    test('the language line names its source: the system, the environment, the settings file', { timeout: 30_000 }, async () => {
        assert.equal((await status({ LANG: 'es_ES.UTF-8' }))[5], 'idioma   es (idioma del sistema)');
        assert.equal((await status({ TAB_RECAP_LOCALE: 'es' }))[5], 'idioma   es (variable de entorno)');
        assert.equal((await status({ TAB_RECAP_RECAP_LANG: 'es' }))[5], 'language es (environment variable)');
        assert.equal((await status())[5], 'language en (system language)');
    });

    test('a language set in the settings file wins over the environment and is named so', { timeout: 30_000 }, async () => {
        world.write('config/config.env', 'TAB_RECAP_LOCALE=es\n');
        const lines = await status({ TAB_RECAP_LOCALE: 'en' });
        assert.equal(lines[5], 'idioma   es (archivo de ajustes)');
        world.write('config/config.env', '');
    });

    test('the state and config lines show the folders herdr gives, whatever the home', { timeout: 30_000 }, async () => {
        const lines = await status();
        assert.equal(lines[7], `state    ${world.state}`);
        assert.equal(lines[8], `config   ${join(world.root, 'config', 'config.env')}`);
    });

    test('TAB_RECAP_STATE wins over herdr\'s state variable', { timeout: 30_000 }, async () => {
        const lines = await status({ TAB_RECAP_STATE: join(world.root, 'other-state') });
        assert.equal(lines[7], `state    ${join(world.root, 'other-state')}`);
        assert.equal(lines[8], `config   ${join(world.root, 'config', 'config.env')}`);
    });

    test('with none of herdr\'s variables set the paths are the defaults under the home', { timeout: 30_000 }, async () => {
        const lines = await status({ HERDR_PLUGIN_CONFIG_DIR: '', HERDR_PLUGIN_STATE_DIR: '', TAB_RECAP_STATE: '' });
        assert.equal(lines[7], `state    ${join(world.home, '.local', 'state', 'herdr', 'plugins', 'tab-recap')}`);
        assert.equal(lines[8], `config   ${join(world.home, '.config', 'herdr', 'plugins', 'config', 'tab-recap', 'config.env')}`);
    });
});
