import { run } from '@stateforge-labs/harness-adapters/runtime';
import { open } from '@stateforge-labs/session-ledger-sqlite/unstable/open.ts';
import { testkit } from '@stateforge-labs/session-ledger-sqlite/testkit';
export const ready = run && open && testkit;
