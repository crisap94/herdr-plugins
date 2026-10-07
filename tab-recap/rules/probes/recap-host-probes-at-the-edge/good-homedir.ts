import { homedir, tmpdir } from 'node:os';

export const places = [homedir(), tmpdir()];
