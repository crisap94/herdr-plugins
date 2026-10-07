// What every launcher does: read the host, ask the policy, then either import the TypeScript entry or present the
// refusal for its kind. Plain JavaScript: nothing here may need a Node that can run TypeScript.
import { nodeHost } from './node-host.mjs';
import { renderRefusal, supportOf } from './policy.mjs';

/** The refusal in the operator's language; English when the catalogs cannot load on this Node. */
async function refusalText(refusal, path) {
    try {
        const { messagesOf } = await import('../daemon/config.ts');
        return messagesOf().cli.hostRefusal(refusal, path);
    } catch {
        return renderRefusal(refusal, path);
    }
}

/** A pane (column, settings, compaction) shows it and stays: a pane that closes is reopened, and the text would flash by. */
async function stay(message) {
    process.stdout.write(`\u001b[2J\u001b[H${message.replaceAll('\n', '\r\n')}\r\n`);
    process.on('SIGTERM', () => { process.exit(0); });
    setInterval(() => undefined, 1 << 30);
    await new Promise(() => undefined);
}

async function refuse(kind, refusal, execPath) {
    const message = await refusalText(refusal, execPath);
    if (kind === 'pane') {
        await stay(message);
    }
    // the daemon's stderr is daemon.log: a dated line; a command's stderr is the operator's terminal
    process.stderr.write(`${kind === 'daemon' ? `${new Date().toISOString()} ` : ''}${message}\n`);
    process.exit(1);
}

/**
 * @param {'pane' | 'daemon' | 'command'} kind
 * @param {string} entry the URL of the TypeScript entry
 * @param {{ host?: import('./node-host.d.mts').Host, argv?: readonly string[] }} [seams] for tests
 */
export async function launch(kind, entry, seams = {}) {
    const host = seams.host ?? nodeHost();
    const refusal = supportOf(host);
    if (refusal.ok) {
        await import(entry);
        return;
    }
    if (kind === 'command' && (seams.argv ?? process.argv.slice(2))[0] === 'status') {
        // `status` reports the old Node itself; when the entry cannot even load, the refusal is all there is to say
        try {
            await import(entry);
        } catch {
            await refuse(kind, refusal, host.execPath);
        }
        return;
    }
    await refuse(kind, refusal, host.execPath);
}
