import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

export type ViewSwitch = 'on' | 'off';

type Setting = ViewSwitch | 'other' | 'unset';

const KEY = 'TAB_RECAP_VIEW_SERVER';
const CONFIG_UNDER_HOME = '.config/herdr/plugins/config/tab-recap/';
const QUOTED = /^(["'])(.*)\1$/su;

const configFile = (env: NodeJS.ProcessEnv, home: URL): URL => {
    const dir = env['HERDR_PLUGIN_CONFIG_DIR'];
    return new URL('config.env', dir === undefined || dir === '' ? new URL(CONFIG_UNDER_HOME, home) : pathToFileURL(`${dir}/`));
};

function fileSetting(file: URL): Setting {
    let text = '';
    try {
        text = readFileSync(file, 'utf8');
    } catch {
        return 'unset';
    }
    let found: Setting = 'unset';
    for (const raw of text.split('\n')) {
        const line = raw.trim();
        const eq = line.indexOf('=');
        if (!line.startsWith('#') && eq > 0 && line.slice(0, eq).trim() === KEY) {
            const value = line.slice(eq + 1).trim();
            const bare = QUOTED.exec(value)?.[2] ?? value;
            found = bare === 'off' || bare === 'on' ? bare : 'other';
        }
    }
    return found;
}

export function viewSwitchOf(env: NodeJS.ProcessEnv, home: URL = pathToFileURL(`${homedir()}/`)): ViewSwitch {
    const given = env[KEY];
    if (given !== undefined && given !== '') {
        return given === 'off' ? 'off' : 'on';
    }
    return fileSetting(configFile(env, home)) === 'off' ? 'off' : 'on';
}
