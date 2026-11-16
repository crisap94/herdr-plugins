import { chmod, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Text } from '#src/recap/domain/text.ts';
import { claimSocket, type Claim } from '#src/wire/socket-claim.ts';

const OWNER_ONLY_DIRECTORY = 0o700;

export async function claimOwnedSocket(socketPath: Text): Promise<Claim> {
    const directory = dirname(socketPath);
    await mkdir(directory, { recursive: true, mode: OWNER_ONLY_DIRECTORY });
    await chmod(directory, OWNER_ONLY_DIRECTORY);
    return claimSocket(socketPath);
}
