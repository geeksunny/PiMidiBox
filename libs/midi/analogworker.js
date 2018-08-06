const baudio = require('baudio');
const EventEmitter = require('eventemitter3');
const ipc = require('../../config/ipc').client('analog', 'master');
const onExit = require('signal-exit');
const tools = require('../tools');
const vol = require('vol');

const SECOND_IN_NANOSECONDS = 1e9;
const MINUTE_IN_NANOSECONDS = 60 * 1e9;

const PULSE_LENGTH = 0.015; // 15 milliseconds in seconds

const BPM_MIN = 60;
const BPM_MAX = 300;

class AnalogClock {
    constructor({ bpm = 120, ppqn = 2, volume = 0.5 } = {}) {
        this._started = false;
        this._pulsing = false;
        this.ppqn = ppqn;
        this.tempo = bpm;
        this.volume = volume;
        this._baudio = baudio((t) => {
            if (t >= this._nextAt) {
                this._pulsing = !this._pulsing;
                this._nextAt += (this._pulsing) ? PULSE_LENGTH : this._tickLength;
            }
            return (this._pulsing) ? 1 : 0;
        });
        this._baudioProcess = undefined;
        this._removeExitHandler = onExit(this._onExit);
    }

    _onExit() {
        if (this._baudioProcess && !this._baudioProcess.killed) {
            this._baudioProcess.kill();
        }
    }

    requestVolume() {
        return new Promise((resolve, reject) => {
            vol.get().then((level) => {
                this._volume = level;
                resolve(level);
            }).catch((err) => {
                reject(err);
            });
        });
    }

    start() {
        if (!this._started) {
            if (!this._tickLength) {
                console.log(`A valid tick length has not been set. Start command was suppressed.`);
                return;
            }
            this._started = true;
            this._pulsing = false;
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

    /**
     * Get the **CACHED** volume level. To get a live reading, use the {Promise} interface at {this.requestVolume()}.
     * @returns {number} A floating point value between 0.0 and 1.0 representing the volume level.
     */
    get volume() {
        return this._volume;
    }

    set volume(level) {
        if (typeof level !== 'number') {
            throw new TypeError(`Value for volume must be 'number'.`);
        }
        level = tools.clipToRange(level, 0.0, 1.0);
        vol.set(level).then(() => {
            this._volume = level;
        }).catch((err) => {
            throw err;
        });
    }
}

class AnalogClockWorker extends EventEmitter {
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
     * @param {Object} [config] - An object defining new configuration settings to be set.
     *      if `undefined`, the current settings will be sent back without any changes.
     * @param {number} [config.bpm] - Tempo to operate the clock at, in BPM (Beats Per Minute).
     * @param {number} [config.volume] - Volume level to be set.
     * @private
     */
    _config(config) {
        if (this._clock) {
            if (!config) {
                this._clock.requestVolume().then((volume) => {
                    ipc.emit('analog.config', { bpm: this._clock.tempo, volume });
                }).catch((reason) => {
                    ipc.emit('analog.error', { message: `An error occurred while requesting the configuration.\n${reason}` });
                });
            } else {
                if (config.bpm) {
                    this._clock.tempo = config.bpm;
                }
                if (config.volume !== undefined) {
                    this._clock.volume = config.volume;
                }
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
        if (this._clock && !this._clock.started) {
            this._clock.start();
            ipc.emit('analog.state', { started: true });
        }
    }

    _stop() {
        if (this._clock && this._clock.started) {
            this._clock.stop();
            ipc.emit('analog.state', { started: false });
        }
    }
}

// Create worker and wait for a command.
const worker = new AnalogClockWorker();
worker.on('destroy', () => {
    console.log(`IPC connection received 'destroy' event! Closing.`);
    process.exit();
});