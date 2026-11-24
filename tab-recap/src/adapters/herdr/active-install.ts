import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { usePlugin } from './client.ts';
import { parseJsonList, parseJsonText } from './json.ts';
import { parseJsonObject, type JsonObject } from './json-object.ts';
import { PLUGIN_ID } from './fleet.ts';
import { parseFsPath, type FsPath } from '#src/recap/domain/fs-path.ts';
import { parseText, type Text } from '@stateforge-labs/session-ledger';
import { causeOf } from '@stateforge-labs/session-ledger';
import { must } from '@stateforge-labs/session-ledger';
import { unknown, type Unknown } from '@stateforge-labs/session-ledger';
import type { ActiveInstallRead, ActiveInstalls } from '#src/ports/active-install.ts';

export type PluginListWire = () => Promise<JsonObject>;
export type Presence = 'present' | 'absent';
export type LauncherPresence = (path: FsPath) => Presence;

const LAUNCHER = join('bin', 'tab-recap.mjs');
const SEMVER = /^\d+\.\d+\.\d+$/;
const NOTHING: JsonObject = {};

const unanswered = (why: Text): Unknown => unknown({ why: 'unreachable', detail: causeOf(why) });

const herdrWire: PluginListWire = async () => {
    const parsed = parseJsonObject(await usePlugin((client) => client.call('plugin.list', {})));
    return parsed.kind === 'ok' ? parsed.value : NOTHING;
};

const onDisk: LauncherPresence = (path) => (existsSync(path) ? 'present' : 'absent');

function entryOf(plugins: readonly JsonObject[], id: Text): JsonObject | null {
    const ours = plugins.filter((plugin) => parseJsonText(plugin['plugin_id']) === id);
    return ours.find((plugin) => plugin['enabled'] === true) ?? ours[0] ?? null;
}

export class HerdrActiveInstalls implements ActiveInstalls {
    private readonly wire: PluginListWire;
    private readonly id: Text;
    private readonly presence: LauncherPresence;

    constructor(wire: PluginListWire = herdrWire, id: Text = must(parseText(PLUGIN_ID)), presence: LauncherPresence = onDisk) {
        this.wire = wire;
        this.id = id;
        this.presence = presence;
    }

    async active(): Promise<ActiveInstallRead> {
        let answer: JsonObject;
        try {
            answer = await this.wire();
        } catch (error) {
            return unanswered(must(parseText(error instanceof Error ? error.message : String(error))));
        }
        const entry = entryOf(parseJsonList(answer['plugins']), this.id);
        if (entry === null) {
            return unanswered(must(parseText(`herdr lists no plugin ${this.id}`)));
        }
        const root = parseFsPath(parseJsonText(entry['plugin_root']));
        const version = parseJsonText(entry['version']);
        if (root.kind !== 'ok' || !SEMVER.test(version)) {
            return unanswered(must(parseText(`herdr gave no root or version for ${this.id}`)));
        }
        const launcher = parseFsPath(join(root.value, LAUNCHER));
        if (launcher.kind !== 'ok' || this.presence(launcher.value) === 'absent') {
            return unanswered(must(parseText(`no launcher in ${root.value}`)));
        }
        return { kind: 'install', root: root.value, version: must(parseText(version)), launcher: launcher.value };
    }
}
