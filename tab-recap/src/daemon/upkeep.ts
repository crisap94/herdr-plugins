import type { Extension } from '#src/ports/extension.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';

export async function upkeep(extensions: readonly Extension[], log: (line: string) => void): Promise<void> {
    for (const extension of extensions) {
        try {
            const done = await extension.upkeep?.();
            if (done === undefined || done.kind === 'idle') {
                continue;
            }
            log(isUnknown(done) ? `${extension.id} upkeep failed: ${saying(done.why)}` : `${extension.id}: ${done.saying}`);
        } catch (error) {
            log(`${extension.id} upkeep threw: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
