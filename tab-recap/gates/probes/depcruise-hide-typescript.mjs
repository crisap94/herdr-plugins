Bun.plugin({
    name: 'hide-typescript',
    setup(build) {
        build.onResolve({ filter: /^typescript(\/.*)?$/ }, ({ path }) => {
            const error = new Error(`Cannot find module '${path}'`);
            error.code = 'MODULE_NOT_FOUND';
            throw error;
        });
    },
});
