import type { Stats } from 'node:fs';
import type { ConnectionHandle } from '#src/adapters/db/connection.ts';

export type Io = Stats | ConnectionHandle;
