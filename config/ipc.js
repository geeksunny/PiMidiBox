const { deepFreeze } = require('../libs/tools');
const ipc = require('node-ipc');
const logger = require('log4js').getLogger();

/*
 * Singleton class for ensuring the IPC module is only being configured once-per-process.
 * Provides an adapter object for with a shared API between Client and Server usage.
 * Once a valid configuration is requested, any subsequent requests of a differing name will
 * throw an exception.
 *
 * Usage:
 *  const ipc = require('config/ipc').server('master');
 *    OR
 *  const ipc = require('config/ipc').client('worker', 'master');
 *
 *  ipc.on('event.name' (data, socket) => { ... });
 *  ipc.emit('event.name', data[, socket]);
 *  ipc.start(() => { ... });
 */

// TODO: expose constants of server names

const settings = deepFreeze({
    master: {
        id: "master",
        logger (... texts) {
            logger.info(... texts);
        }
    },
    clock: {
        id: "clock"
    },
    analog: {
        id: "analog"
    },
    messenger: {
        id: "messenger"
    },
    ui: {
        id: "ui"
    }
});

class IpcAdapter {
    constructor({ ipc } = {}) {
        if (!ipc) {
            throw "IPC object missing!";
        }
        this._ipc = ipc;
        this._eventHandlers = {};
        this._started = false;
    }

    get ipc() {
        return this._ipc;
    }

    _emit(event, data, socket) {
        throw "Not implemented!";
    }

    _on(event, handler) {
        throw "Not implemented!";
    }

    _start(callback) {
        throw "Not implemented!";
    }

    _stop(callback) {
        throw "Not implemented!";
    }

    emit(event, data, socket) {
        if (this._started) {
            this._emit(event, data, socket);
        }
    }

    on(event, handler) {
        if (!this._started) {
            if (!this._eventHandlers[event]) {
                this._eventHandlers[event] = [];
            }
            this._eventHandlers[event].push(handler);
        } else {
            this._on(event, handler);
        }
    }

    start(callback) {
        if (this._started) {
            return;
        }
        this._start(callback);
        for (let name of Object.keys(this._eventHandlers)) {
            for (let handler of this._eventHandlers[name]) {
                this._on(name, handler);
            }
            delete this._eventHandlers[name];
        }
        this._started = true;
    }

    stop(callback) {
        if (!this._started) {
            return;
        }
        this._stop(callback);
        this._started = false;
    }
}

class IpcServer extends IpcAdapter {
    constructor(opts) {
        super(opts);
    }

    _emit(event, data, socket) {
        if (socket) {
            this.ipc.server.emit(socket, event, data);
        } else {
            this.ipc.server.broadcast(event, data);
        }
    }

    _on(event, handler) {
        this.ipc.server.on(event, handler);
    }

    _start(callback) {
        this.ipc.serve(callback);
        this.ipc.server.start();
    }

    _stop(callback) {
        if (typeof callback === 'function') {
            this.ipc.server.once('destroy', callback);
        }
        this.ipc.server.stop();
    }
}

class IpcClient extends IpcAdapter {
    constructor(opts) {
        if (!opts.serverName) {
            throw "Requires name of server to connect to!";
        }
        super(opts);
        this._serverName = opts.serverName;
    }

    _emit(event, data) {
        this.ipc.of[this._serverName].emit(event, data);
    }

    _on(event, handler) {
        this.ipc.of[this._serverName].on(event, handler);
    }

    _start(callback) {
        this.ipc.connectTo(this._serverName, callback);
    }

    _stop(callback) {
        if (typeof callback === 'function') {
            this.ipc.of[this._serverName].once('destroy', callback);
        }
        this.ipc.disconnect(this._serverName);
    }
}

class Ipc {
    constructor() {
        this._name = undefined;
        this._adapter = undefined;
    }

    client(name, serverName) {
        return this._request(name, IpcClient, { serverName });
    }

    server(name) {
        return this._request(name, IpcServer);
    }

    _request(name, wrapperType, opts = {}) {
        if (this._name) {
            if (this._name !== name) {
                throw `IPC already configured for '${this._name}' - Cannot reconfigure to '${name}'.`;
            } else if (!(this._adapter instanceof wrapperType)) {
                throw `IPC already configured as type '${this._adapter.constructor.name}' - Cannot reconfigure to type '${wrapperType.name}'`;
            } else {
                return this._adapter;
            }
        } else if (settings[name]) {
            this._configure(name, settings[name]);
            opts.ipc = ipc;
            this._adapter = new wrapperType(opts);
            return this._adapter;
        } else {
            throw `IPC configuration for '${name}' does not exist!`;
        }
    }

    _configure(name, settings) {
        if (this._name) {
            throw `IPC already configured for '${this._name}' - Cannot reconfigure to '${name}'.`;
        }
        this._name = name;
        for (let key in settings) {
            // noinspection JSUnfilteredForInLoop
            ipc.config[key] = settings[key];
        }
    }
}

module.exports = new Ipc();