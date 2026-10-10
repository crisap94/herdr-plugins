const FAMILIES = { darwin: 'macos', win32: 'windows' };
export const platformOf = (raw) => FAMILIES[raw] ?? 'linux';

export function nodeHost(running = process) {
    return {
        nodeVersion: running.version,
        execPath: running.execPath,
        platform: platformOf(running.platform),
        path: running.env['PATH'] ?? '',
    };
}
