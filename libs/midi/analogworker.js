const baudio = require('baudio');
const EventEmitter = require('eventemitter3');
const ipc = require('../../config/ipc').client('analog', 'master');
const onExit = require('signal-exit');
const tools = require('../tools');

const SECOND_IN_NANOSECONDS = 1e9;
const MINUTE_IN_NANOSECONDS = 60 * 1e9;

const PULSE_LENGTH = 0.015; // 15 milliseconds in seconds

const BPM_MIN = 60;
const BPM_MAX = 300;

class AnalogClock {
    constructor({ bpm = 120, ppqn = 2 } = {}) {
        this._started = false;
        this._pulsing = false;
        this.ppqn = ppqn;
        this.tempo = bpm;
        this._baudio = baudio(this._audioHandler);
        this._baudioProcess = undefined;
        this._removeExitHandler = onExit(this._onExit);
    }

    _audioHandler(t) {
        if (t >= this._nextAt) {
            this._pulsing = !this._pulsing;
            this._nextAt += (this._pulsing) ? PULSE_LENGTH : this._tickLength;
        }
        return (this._pulsing) ? 1 : 0;
    }

    _onExit() {
        if (this._baudioProcess && !this._baudioProcess.killed) {
            this._baudioProcess.kill();
        }
    }

    start() {
        if (!this._started) {
            if (!this._tickLength) {
                console.log(`A valid tick length has not been set. Start command was suppressed.`);
                return;
            }
            this._started = true;
            this._nextAt = 0;
            this._baudioProcess = this._baudio.play();
        }
    }

    stop() {
        if (this._started) {
            if (this._baudioProcess) {
                this._baudioProcess.kill();
                this._baudioProcess = undefined;
            }
            this._started = false;
        }
    }

    get ppqn() {
        return this._ppqn;
    }

    set ppqn(ppqn) {
        if (typeof ppqn !== 'number') {
            throw "PPQN must be a number!";
        }
        this._ppqn = Math.abs(ppqn);
    }

    get tempo() {
        return this._bpm;
    }

    set tempo(bpm) {
        if (!this._ppqn) {
            throw "No valid PPQN value set! Unable to set clock tempo.";
        }
        let _bpm = tools.clipToRange(bpm, BPM_MIN, BPM_MAX);
        if (_bpm !== bpm) {
            logger.warn(`Invalid BPM (${bpm}) - Clipping to ${_bpm}`);
            bpm = _bpm;
        }
        if (this._bpm !== bpm) {
            this._bpm = bpm;
            let tickNanoseconds = MINUTE_IN_NANOSECONDS / (this._bpm * this._ppqn);
            this._tickLength = (tickNanoseconds / SECOND_IN_NANOSECONDS) - PULSE_LENGTH;
        }
    }
}

class Worker extends EventEmitter {
    constructor(opts = {}) {
        super();
        this._clock = new AnalogClock(opts);
        this._setup();
    }

    _setup() {
        ipc.on('analog.config', this._config);
        ipc.on('analog.control', this._control);
        ipc.on('destroy', () => {
            this.emit('destroy');
        });
        ipc.start(() => {
            ipc.emit('analog.ready');
        });
    }

    /**
     * @param {Object} [opts]
     * @param {number} [opts.bpm] - Tempo to operate the clock at, in BPM (Beats Per Minute).
     * @private
     */
    _config({ bpm } = {}) {
        if (this._clock) {
            if (bpm) {
                this._clock.tempo = bpm;
            }
        }
    }

    _control({ action } = {}) {
        switch (action) {
            case 'start':
                this._start();
                break;
            case 'stop':
                this._stop();
                break;
        }
    }

    _start() {
        if (this._clock) {
            this._clock.start();
        }
    }

    _stop() {
        if (this._clock) {
            this._clock.stop();
        }
    }
}

// Create worker and wait for a command.
const worker = new Worker();
worker.on('destroy', () => {
    console.log(`IPC connection received 'destroy' event! Closing.`);
    process.exit();
});