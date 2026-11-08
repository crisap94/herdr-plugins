const FAMILIES = { darwin: 'macos', win32: 'windows' };
export const platformOf = (raw) => FAMILIES[raw] ?? 'linux';

export function bunHost(running = process) {
    return {
        bunVersion: running.versions?.bun ?? `node ${running.version}`,
        execPath: running.execPath,
        platform: platformOf(running.platform),
        path: running.env['PATH'] ?? '',
    };
}
