const Module = require('node:module');
const resolve = Module._resolveFilename;

Module._resolveFilename = function hide(request, ...rest) {
    if (request === 'typescript' || request.startsWith('typescript/')) {
        const error = new Error(`Cannot find module '${request}'`);
        error.code = 'MODULE_NOT_FOUND';
        throw error;
    }
    return resolve.call(this, request, ...rest);
};
