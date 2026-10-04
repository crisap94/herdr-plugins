import { writeFileSync } from 'node:fs';

export function scribble(): void {
    writeFileSync('/tmp/x', 'y');
}
