import { createServer } from 'node:net';
import type { Socket } from 'node:net';
import { decodeClient, encode } from '#src/wire/view/codec.ts';
import type { ClientMessage, DaemonMessage } from '#src/wire/view/protocol.ts';
import { peerOf } from './transcript.ts';
import type { Peer } from './transcript.ts';

export type DaemonScript = (message: ClientMessage) => readonly DaemonMessage[];

export interface FakeViewDaemon {
    received: ClientMessage[];
    send(m: DaemonMessage): void;
    drop(): void;
    stop(): Promise<void>;
}

const pump = async (peer: Peer, received: ClientMessage[], script: DaemonScript): Promise<void> => {
    for (let line = await peer.next(null); line !== null; line = await peer.next(null)) {
        const message = decodeClient(line);
        if (!('kind' in message)) {
            received.push(message);
            script(message).forEach((answer) => {
                peer.write(encode(answer));
            });
        }
    }
};

export async function startFakeViewDaemon(socketPath: string, script?: DaemonScript): Promise<FakeViewDaemon> {
    const received: ClientMessage[] = [];
    const peers: Peer[] = [];
    const answer = script ?? ((): readonly DaemonMessage[] => []);
    const server = createServer((socket: Socket) => {
        const peer = peerOf(socket);
        peers.push(peer);
        void pump(peer, received, answer);
    });
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(socketPath, () => {
            resolve();
        });
    });
    return {
        received,
        send: (m: DaemonMessage): void => {
            peers.at(-1)?.write(encode(m));
        },
        drop: (): void => {
            peers.at(-1)?.socket.destroy();
        },
        stop: async (): Promise<void> => {
            peers.forEach((peer) => {
                peer.socket.destroy();
            });
            await new Promise<void>((resolve) => {
                server.close(() => {
                    resolve();
                });
            });
        },
    };
}
