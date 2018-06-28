const EventEmitter = require('eventemitter3');
const IpcConfig = require('../../config/ipc');
const sleep = require('sleep');
const tools = require('../tools');


/**
 * Worker class for calculating ticks. Will only run if the master IPC server is running in another process.
 */
class Worker extends EventEmitter {
    constructor(opts = {}) {
        super();
        this._started = false;
        this._stopQueued = false;
        this._setup();
        this._config(opts);
        this.on('tick', this._tick);
    }

    _setup() {
        let ipc = IpcConfig.request('clock');   // TODO: move ipc into class object for use in other methods
        ipc.of.master.on('clock.config', this._config);
        ipc.of.master.on('clock.control', this._control);
        ipc.connectTo('master');
        this._ipc = ipc;
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
        if (!this._started || this._stopQueued) {
            return;
        }
        // TODO: sleep loop here
        this._ipc.of.master.emit('clock.tick');
        this.emit('tick');
    }
}

/**
 * Represents the current position on the clock.
 */
class Tick {
    /**
     *
     * @param {Number} position - Position in the sequence.
     * @param {Number} [ppqn] - pulses per quarter note.
     * @param {Number} [patternLength] - Number of quarternotes per pattern.
     * // TODO: allow for more broad/narrow note precision for patternLength
     */
    constructor(position, ppqn = 24, patternLength = 16) {
        this._pos = position;
        this._ppqn = Math.trunc(ppqn);
        this._patternLength = Math.trunc(patternLength) * this._ppqn;
    }

    get pulse() {
        return this._pos % this._ppqn;
    }

    get wholeNote() {
        return Math.trunc(this._pos / (this._ppqn * 4));
    }

    get isWholeNote() {
        return (this._pos % (this._ppqn * 4)) === 0;
    }

    get patternWholeNote() {
        // TODO: use patternLength
        return Math.trunc((this._pos / (this._ppqn * 4)) % 4);
    }

    get halfNote() {
        return Math.trunc(this._pos / (this._ppqn * 2));
    }

    get isHalfNote() {
        return (this._pos % (this._ppqn * 2)) === 0;
    }

    get patternHalfNote() {
        // TODO: use patternLength
        return Math.trunc((this._pos / (this._ppqn * 2)) % 8);
    }

    get quarterNote() {
        return Math.trunc(this._pos / this._ppqn);
    }

    get isQuarterNote() {
        return (this._pos % this._ppqn) === 0;
    }

    get patternQuarterNote() {
        // TODO: use patternLength
        return Math.trunc(this._pos / this._ppqn) % 16;
    }

    get eighthNote() {
        return Math.trunc(this._pos / (this._ppqn / 2));
    }

    get isEighthNote() {
        return (this._pos % (this._ppqn / 2)) === 0;
    }

    get patternEighthNote() {
        // TODO: use patternLength
        return Math.trunc(this._pos / this._ppqn / 2) % 32;
    }

    get sixteenthNote() {
        return Math.trunc(this._pos / (this._ppqn / 4));
    }

    get isSixteenthNote() {
        return (this._pos % (this._ppqn / 4)) === 0;
    }

    get patternSixteenthNote() {
        // TODO: use patternLength
        return Math.trunc(this._pos / this._ppqn / 4) % 64;
    }
}
