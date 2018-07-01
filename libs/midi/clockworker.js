const EventEmitter = require('eventemitter3');
const ipc = require('../../config/ipc').request('clock');
const sleep = require('sleep');

/**
 * Worker class for calculating ticks. Will only run if the master IPC server is running in another process.
 */
class Worker extends EventEmitter {
    constructor(opts = {}) {
        super();
        this._started = false;
        this._stopQueued = false;
        this._config(opts);
        this.on('tick', this._tick);
        this._setup();
    }

    _setup() {
        ipc.of.master.on('clock.config', this._config);
        ipc.of.master.on('clock.control', this._control);
        ipc.connectTo('master', () => {
            ipc.of.master.emit('clock.ready');
        });
    }

    _config({tickLength} = {}) {
        if (tickLength) {
            this._tickLength = tickLength;
        }
    }

    _control({action} = {}) {
        switch (action) {
            case 'start':
                if (!this._started) {
                    this._started = true;
                    ipc.of.master.emit('clock.state', {started: true});
                    this.emit('tick');
                }
                break;
            case 'stop':
                this._stopQueued = this._started;
                break;
            // default:
            //     break;
        }
    }

    _tick() {
        if (this._stopQueued) {
            ipc.of.master.emit('clock.state', {started: false});
            this._stopQueued = false;
            this._started = false;
        } else if (this._started) {
            // TODO: sleep loop here
            ipc.of.master.emit('clock.tick');
            this.emit('tick');
        }
    }
}

// Create worker and wait for a command.
const worker = new Worker();