import { registerHooks } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { world } from './herdr.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const GUI_ROOT = join(HERE, '..', '..', '..', '..', 'desktop', 'mods', 'tab-recap');
const KIT = pathToFileURL(join(HERE, 'kit.ts')).href;
const HERDR = pathToFileURL(join(HERE, 'herdr.ts')).href;
const FAKES = new Map([['gpui-kit', KIT], ['gpui-base', KIT], ['herdr', HERDR]]);
const STORAGE = 'localStorage';
const HOST_ZONE = 'UTC';
let registered = false;
process.env['TZ'] = HOST_ZONE;

export const guiPath = (relative: string): string => join(GUI_ROOT, relative);

export class MemoryStorage {
    readonly map = new Map<string, string>();
    broken = false;

    getItem(key: string): string | null {
        if (this.broken) {
            throw new Error('storage unavailable');
        }
        return this.map.get(key) ?? null;
    }

    setItem(key: string, value: string): void {
        if (this.broken) {
            throw new Error('storage unavailable');
        }
        this.map.set(key, value);
    }
}

export const storage = new MemoryStorage();

function install(): void {
    if (registered) {
        return;
    }
    registered = true;
    registerHooks({
        resolve(specifier, context, next) {
            const fake = FAKES.get(specifier);
            return fake ? { url: fake, shortCircuit: true } : next(specifier, context);
        },
    });
    Reflect.set(globalThis, STORAGE, storage);
    Date.now = (): number => world.now;
}

export async function loadGui<T>(relative: string): Promise<T> {
    install();
    const url: string = pathToFileURL(guiPath(relative)).href;
    return import(url);
}

export const settle = async (): Promise<void> => {
    for (let round = 0; round < 5; round += 1) {
        await new Promise<void>((done) => { setImmediate(done); });
    }
};
