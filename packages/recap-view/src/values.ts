import type { Brand } from './kernel.ts';

export type Instant = Brand<number, 'Instant'>;
export type Duration = Brand<number, 'Duration'>;
export type Tokens = Brand<number, 'Tokens'>;
export type SessionKey = Brand<string, 'SessionKey'>;
export type AgentName = Brand<string, 'AgentName'>;
export type AgentLabel = Brand<string, 'AgentLabel'>;
export type Title = Brand<string, 'Title'>;
export type Prose = Brand<string, 'Prose'>;
export type TaskName = Brand<string, 'TaskName'>;
export type Directory = Brand<string, 'Directory'>;
export type FilePath = Brand<string, 'FilePath'>;
export type RepoName = Brand<string, 'RepoName'>;
export type BranchName = Brand<string, 'BranchName'>;
export type WebBase = Brand<string, 'WebBase'>;
export type FromScreen = Brand<boolean, 'FromScreen'>;
export type Running = Brand<boolean, 'Running'>;
export type Queued = Brand<boolean, 'Queued'>;
export type Curating = Brand<boolean, 'Curating'>;

const isInstant = (input: unknown): input is Instant => typeof input === 'number';

export function parseInstant(input: unknown): Instant {
    if (isInstant(input)) return input;
    throw new TypeError('Instant is a number');
}

const isDuration = (input: unknown): input is Duration => typeof input === 'number';

export function parseDuration(input: unknown): Duration {
    if (isDuration(input)) return input;
    throw new TypeError('Duration is a number');
}

const isTokens = (input: unknown): input is Tokens => typeof input === 'number';

export function parseTokens(input: unknown): Tokens {
    if (isTokens(input)) return input;
    throw new TypeError('Tokens is a number');
}

const isPaneId = (input: unknown): input is SessionKey => typeof input === 'string';

export function parsePaneId(input: unknown): SessionKey {
    if (isPaneId(input)) return input;
    throw new TypeError('PaneId is a string');
}

const isAgentName = (input: unknown): input is AgentName => typeof input === 'string';

export function parseAgentName(input: unknown): AgentName {
    if (isAgentName(input)) return input;
    throw new TypeError('AgentName is a string');
}

const isAgentLabel = (input: unknown): input is AgentLabel => typeof input === 'string';

export function parseAgentLabel(input: unknown): AgentLabel {
    if (isAgentLabel(input)) return input;
    throw new TypeError('AgentLabel is a string');
}

const isTitle = (input: unknown): input is Title => typeof input === 'string';

export function parseTitle(input: unknown): Title {
    if (isTitle(input)) return input;
    throw new TypeError('Title is a string');
}

const isProse = (input: unknown): input is Prose => typeof input === 'string';

export function parseProse(input: unknown): Prose {
    if (isProse(input)) return input;
    throw new TypeError('Prose is a string');
}

const isTaskName = (input: unknown): input is TaskName => typeof input === 'string';

export function parseTaskName(input: unknown): TaskName {
    if (isTaskName(input)) return input;
    throw new TypeError('TaskName is a string');
}

const isDirectory = (input: unknown): input is Directory => typeof input === 'string';

export function parseDirectory(input: unknown): Directory {
    if (isDirectory(input)) return input;
    throw new TypeError('Directory is a string');
}

const isFilePath = (input: unknown): input is FilePath => typeof input === 'string';

export function parseFilePath(input: unknown): FilePath {
    if (isFilePath(input)) return input;
    throw new TypeError('FilePath is a string');
}

const isRepoName = (input: unknown): input is RepoName => typeof input === 'string';

export function parseRepoName(input: unknown): RepoName {
    if (isRepoName(input)) return input;
    throw new TypeError('RepoName is a string');
}

const isBranchName = (input: unknown): input is BranchName => typeof input === 'string';

export function parseBranchName(input: unknown): BranchName {
    if (isBranchName(input)) return input;
    throw new TypeError('BranchName is a string');
}

const isWebBase = (input: unknown): input is WebBase => typeof input === 'string';

export function parseWebBase(input: unknown): WebBase {
    if (isWebBase(input)) return input;
    throw new TypeError('WebBase is a string');
}

const isFromScreen = (input: unknown): input is FromScreen => typeof input === 'boolean';

export function parseFromScreen(input: unknown): FromScreen {
    if (isFromScreen(input)) return input;
    throw new TypeError('FromScreen is a boolean');
}

const isRunning = (input: unknown): input is Running => typeof input === 'boolean';

export function parseRunning(input: unknown): Running {
    if (isRunning(input)) return input;
    throw new TypeError('Running is a boolean');
}

const isQueued = (input: unknown): input is Queued => typeof input === 'boolean';

export function parseQueued(input: unknown): Queued {
    if (isQueued(input)) return input;
    throw new TypeError('Queued is a boolean');
}

const isCurating = (input: unknown): input is Curating => typeof input === 'boolean';

export function parseCurating(input: unknown): Curating {
    if (isCurating(input)) return input;
    throw new TypeError('Curating is a boolean');
}
