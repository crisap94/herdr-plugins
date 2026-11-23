import { must } from '#src/protocol/result.ts';
import { parseSettingsFile } from './config.ts';

export function parseEnv(text: string): ReadonlyMap<string, string> {
    return must(parseSettingsFile(text));
}
