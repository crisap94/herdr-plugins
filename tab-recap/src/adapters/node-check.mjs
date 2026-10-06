// The Node check, in plain JavaScript on purpose: a Node too old to run TypeScript cannot parse the rest of the
// plugin, so what says "your Node is too old" must not need it. No TypeScript syntax here, no import of one at the top.

/** The Node the plugin needs: it runs the TypeScript directly, and the state lives in `node:sqlite` as it is from 24.15 (no experimental warning, so no launch needs a flag). */
export const MIN_NODE = '24.21.0';

/** @param {string} text */
const versionParts = (text) => (/^v?(\d+)\.(\d+)\.(\d+)/.exec(text.trim()) ?? []).slice(1).map(Number);

/**
 * Whether `version` (`v24.21.0`) is `minimum` or newer; false for anything that is not a version.
 * @param {string} version
 * @param {string} [minimum]
 */
export function nodeAtLeast(version, minimum = MIN_NODE) {
    const [have, need] = [versionParts(version), versionParts(minimum)];
    if (have.length !== 3) {
        return false;
    }
    const at = need.findIndex((part, index) => part !== have[index]);
    return at === -1 || (have[at] ?? 0) > (need[at] ?? 0);
}

/** The words used when the catalogs cannot be loaded (a Node that cannot run the TypeScript). */
const FALLBACK = (version, minimum, path) => [
    `tab-recap needs Node >= ${minimum}, but this is ${version} (${path}).`,
    'To fix it:',
    `  1. Install Node >= ${minimum} (nvm install 24 · brew install node · mise use -g node@24).`,
    '  2. Run: herdr server stop',
    `  3. Open a new terminal and check that \`node --version\` prints ${minimum} or newer.`,
    '  4. Start herdr from that terminal.',
].join('\n');

/** The message in the operator's language; English when the catalogs cannot load on this Node. */
async function messageFor(version, path) {
    try {
        const { messagesOf } = await import('../daemon/config.ts');
        return messagesOf().cli.nodeTooOld(version, MIN_NODE, path);
    } catch {
        return FALLBACK(version, MIN_NODE, path);
    }
}

/**
 * Called first by every entry point (as the first import, so it runs before anything else is evaluated).
 * Nothing happens when the Node is new enough. Otherwise: the daemon logs the message and exits; a column or a popup
 * shows it and stays (a pane that closes is reopened, and the message would flash by); a command prints it and exits,
 * except `status`, which prints it as part of its report.
 * @param {'daemon' | 'pane' | 'command'} kind
 * @param {{ version?: string, path?: string, argv?: readonly string[] }} [host]
 */
export async function guardNode(kind, host = {}) {
    const version = host.version ?? process.version;
    if (nodeAtLeast(version)) {
        return;
    }
    const message = await messageFor(version, host.path ?? process.execPath);
    if (kind === 'command') {
        if ((host.argv ?? process.argv.slice(2))[0] === 'status') {
            return;
        }
        process.stderr.write(`${message}\n`);
        process.exit(1);
    }
    if (kind === 'daemon') {
        process.stderr.write(`${new Date().toISOString()} ${message}\n`);
        process.exit(1);
    }
    process.stdout.write(`\u001b[2J\u001b[H${message.replaceAll('\n', '\r\n')}\r\n`);
    process.on('SIGTERM', () => { process.exit(0); });
    setInterval(() => {}, 1 << 30);
    await new Promise(() => {});
}
