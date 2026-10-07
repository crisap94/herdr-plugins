// The Host port's adapter: what the running Node says about itself. Plain JavaScript, read by the launchers before
// any TypeScript loads. The only module (with the other adapters under src/host/) that probes the operating system.

/** @param {string} raw a `process.platform` (Linux and every other Unix are the `linux` family) */
const FAMILIES = { darwin: 'macos', win32: 'windows' };
export const platformOf = (raw) => FAMILIES[raw] ?? 'linux';

/** @param {{ version: string, execPath: string, platform: string, env: Record<string, string | undefined> }} [running] */
export function nodeHost(running = process) {
    return {
        nodeVersion: running.version,
        execPath: running.execPath,
        platform: platformOf(running.platform),
        path: running.env['PATH'] ?? '',
    };
}
