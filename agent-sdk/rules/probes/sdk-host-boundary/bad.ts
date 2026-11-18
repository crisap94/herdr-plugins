import { query } from '@anthropic-ai/claude-agent-sdk';
import { readFileSync } from 'node:fs';
import { helper } from '../../../tab-recap/src/helper.ts';
export const label = 'claude-code/x';
export const ready = query && readFileSync && helper && label;
