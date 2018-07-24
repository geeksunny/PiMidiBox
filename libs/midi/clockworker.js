const EventEmitter = require('eventemitter3');
const ipc = require('../../config/ipc').client('clock', 'master');
const sleep = require('sleep');
const { now } = require('../tools');

/**
 * Worker class for calculating ticks. Will only run if the master IPC server is running in another process.
 */
class Worker extends EventEmitter {
    constructor(opts = {}) {
        super();
        this._started = false;
        this._stopQueued = false;
        this._nextAt = 0;
        this._config(opts);
        this.on('tick', this._tick);
        this._setup();
    }

    _setup() {
        ipc.on('clock.config', this._config);
        ipc.on('clock.control', this._control);
        ipc.on('destroy', () => {
            this.emit('destroy');
        });
        ipc.start(() => {
            ipc.emit('clock.ready');
        });
    }

    _config({ tickLength } = {}) {
        if (tickLength) {
            this._tickLength = tickLength;
        }
    }

    _control({ action } = {}) {
        switch (action) {
            case 'start':
                if (!this._started) {
                    this._started = true;
                    ipc.emit('clock.state', { started: true });
                    this._nextAt = now();
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
            ipc.emit('clock.state', { started: false });
            this._stopQueued = false;
            this._started = false;
        } else if (this._started) {
            this._nextAt += this._tickLength;
            let diff = this._nextAt - now();
            if (diff > 0) {
                sleep.nsleep(diff);
                ipc.emit('clock.tick');
                this.emit('tick');
            } else {
                ipc.emit('clock.error', {
                    message: `Received invalid diff value (${diff}). Timeout expired before performing any thread sleep. Timing at this precision may not be achievable.`
                });
                ipc.emit('clock.state', { started: false });
                this._stopQueued = false;
                this._started = false;
            }
        }
    }
}

// Create worker and wait for a command.
const worker = new Worker();
worker.on('destroy', () => {
    console.log(`IPC connection received 'destroy' event! Closing.`);
    process.exit();
});