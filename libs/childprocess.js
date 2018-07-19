const logger = require('log4js').getLogger();
const onExit = require('signal-exit');
const { fork } = require('child_process');

class Wrapper {
    constructor(childProcess) {
        this._process = childProcess;
        this._removeExitHandler = onExit(this._onExit);
    }

    _onExit() {
        if (!this._process.killed) {
            this._process.kill();
        }
    }

    get killed() {
        return this._process.killed;
    }

    kill() {
        this._onExit();
        if (this._removeExitHandler) {
            this._removeExitHandler();
            delete this._removeExitHandler;
        }
    }
}

// TODO: add wrapper for spawn/exec?
const _fork = (label, filePath, args, options) => {
    // TODO: make stdout/stderr printing optional
    let forked = fork(filePath, args, options);
    forked.stdout.on('data', (data) => {
        logger.log(`[${label}:out] ${data}`);
    });
    forked.stderr.on('data', (data) => {
        logger.error(`[${label}:err] ${data}`);
    });
    return new Wrapper(forked);
};

module.exports = { fork: _fork };