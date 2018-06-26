const ipc = require('node-ipc');

/*
 * Singleton class for ensuring the IPC module is only being configured once-per-process.
 * Once a valid configuration is requested, any subsequent requests of a differing name will
 * throw an exception.
 *
 * Usage: const ipc = require('config/ipc.js').request('master');
 */

// TODO: expose constants of server names

const settings = {
    "master": {
        id: "master"
    },
    "clock": {
        id: "clock"
    },
    "ui": {
        id: "ui"
    }
};

class Ipc {
    constructor() {
        this._name = undefined;
    }

    request(name) {
        if (this._name) {
            if (this._name === name) {
                return ipc;
            } else {
                throw `IPC already configured for '${this._name}' - Cannot reconfigure to '${name}'.`;
            }
        } else if (settings[name]) {
            this._configure(name, settings[name]);
            return ipc;
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