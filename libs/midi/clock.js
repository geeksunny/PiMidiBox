const EventEmitter = require('eventemitter3');
const cp = require('../childprocess');
const ipc = require('../../config/ipc').server('master');
const logger = require('log4js').getLogger();
const { Message, Input, Output } = require('./core');
const { Adjuster, MessageTypeFilter } = require('./filter');
const tools = require('../tools');

// TODO: Add configuration option for microseconds over nanoseconds
const MINUTE_IN_MICROSECONDS = 60 * 1e6;
const MINUTE_IN_NANOSECONDS = 60 * 1e9;

const TAP_TIMEOUT = 3 * 1e9;    // 3 seconds in nanoseconds

const BPM_MIN = 60;
const BPM_MAX = 300;
const BPM_STEPS = (BPM_MIN - BPM_MAX) / 128;

const MIDI_CLOCK = Message.fromProperties('clock').bytes;
const MIDI_START = Message.fromProperties('start').bytes;
const MIDI_STOP = Message.fromProperties('stop').bytes;
const MIDI_CONT = Message.fromProperties('continue').bytes;

// TODO: Add Song Pointer Position (SPP) message support

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

/**
 * Master class for coordinating with and controlling the Digital Clock Worker.
 */
class DigitalClockMaster extends EventEmitter {
    // TODO: add logic for swing. (Is this even possible through midi clock signals?)
    // TODO: add 'wholenote', 'quarternote', etc events?
    constructor({ ppqn = 24, bpm = 120, patternLength = 16 } = {}) {
        super();
        this._startQueued = false;
        this._started = false;
        this._paused = false;
        this._socket = undefined;
        this._workerProcess = undefined;
        this._ticks = 0;
        this._ppqn = ppqn;
        this._patternLength = patternLength;
        this._pos = 0;
        this.tempo = bpm;
        this._setup();
    }

    _setup() {
        ipc.on('clock.ready', (data, socket) => {
            this._socket = socket;
            this._updateWorker();
        });
        ipc.on('clock.tick', () => {
            this.emit('tick', {
                tick: new Tick(this._pos++, this._ppqn, this._patternLength),
                ticks: ++this._ticks
            });
        });
        ipc.on('clock.state', ({ started }) => {
            if (typeof started !== 'boolean') {
                logger.error(`Unsupported type passed for 'clock.state.started' (${typeof started}), requires boolean.`);
                return;
            }
            this._started = started;
            if (this._paused) {
                if (started) {
                    this._paused = false;
                    this.emit('unpause');
                } else {
                    this.emit('pause');
                }
            } else {
                this.emit(started ? 'start' : 'stop');
            }
        });
        ipc.on('clock.error', ({ message }) => {
            logger.error(`Clock error occurred!\n${message}`);
        });
    }

    _updateWorker() {
        if (this._socket) {
            ipc.emit('clock.config', { tickLength: this._tickLength }, this._socket);
            if (this._startQueued) {
                this._startQueued = false;
                this.start();
            }
        }
    }

    start() {
        if (this._socket) {
            if (!this._started) {
                this._paused = false;
                ipc.emit('clock.control', { action: 'start' }, this._socket);
            }
            return;
        }
        this._startQueued = true;
        if (!this._workerProcess) {
            this._workerProcess = cp.fork('clock', './clockworker.js');
        }
    }

    stop() {
        if (this._socket && (this._started || this._ticks > 0)) {
            this._paused = false;
            ipc.emit('clock.control', { action: 'stop' }, this._socket);
            this._pos = 0;
            this._ticks = 0;
        }
    }

    pause() {
        if (this._socket && (this._started && !this._paused)) {
            this._paused = true;
            ipc.emit('clock.control', { action: 'stop' }, this._socket);
        }
    }

    unpause() {
        if (this._socket && (this._started && this._paused)) {
            ipc.emit('clock.control', { action: 'start' }, this._socket);
        }
    }

    kill() {
        this._socket.end();
        this._socket = undefined;
        this._started = false;
        this._paused = false;
        if (this._workerProcess) {
            this._workerProcess.kill();
            this._workerProcess = undefined;
        }
    }

    get ticking() {
        return this._started && !this._paused;
    }

    set tempo(bpm) {
        let _bpm = tools.clipToRange(bpm, BPM_MIN, BPM_MAX);
        if (_bpm !== bpm) {
            logger.warn(`Invalid BPM (${bpm}) - Clipping to ${_bpm}`);
            bpm = _bpm;
        }
        if (this._bpm !== bpm) {
            this._bpm = bpm;
            this._tickLength = MINUTE_IN_NANOSECONDS / (this._bpm * this._ppqn);
            this._updateWorker();
            this.emit('set', { bpm });
        }
    }

    get tempo() {
        return this._bpm;
    }

    set patternLength(quarterNotes) {
        this._patternLength = quarterNotes;
        this.emit('set', { patternLength: quarterNotes });
    }

    get patternLength() {
        return this._patternLength;
    }
}

class AnalogClockMaster extends EventEmitter {
    // TODO: Should this share code with DigitalClockMaster?
    constructor({ bpm = 120, volume = 0.5 } = {}) {
        super();
        this._startQueued = true;
        this._started = false;
        this._socket = undefined;
        this._workerProcess = undefined;
        this.tempo = bpm;
        this.volume = volume;
        this._setup();
    }

    _setup() {
        ipc.on('analog.ready', (data, socket) => {
            this._socket = socket;
            this._updateWorker();
        });
        ipc.on('analog.state', ({ started }) => {
            if (typeof started !== 'boolean') {
                logger.error(`Unsupported type passed for 'analog.state.started' (${typeof started}), requires boolean.`);
                return;
            }
            this._started = started;
            this.emit(started ? 'start' : 'stop');
        });
        ipc.on('analog.config', (config) => {
            this._bpm = config.bpm;
            this._volume = config.volume;
            this.emit('config', config);
        });
        ipc.on('analog.error', ({ message }) => {
            logger.error(`Analog clock error occurred!\n${message}`);
        });
    }

    /**
     * Update the worker's configuration.
     * @param {Object} [config] - Optional configuration object to deploy to the worker. If not provided, the default
     *      config payload will be used.
     * @private
     */
    _updateWorker(config) {
        if (this._socket) {
            if (!config) {
                config = { bpm: this._bpm };
            }
            ipc.emit('analog.config', config, this._socket);
            if (this._startQueued) {
                this._startQueued = false;
                this.start();
            }
        }
    }

    start() {
        if (this._socket) {
            if (!this._started) {
                ipc.emit('analog.control', { action: 'start' }, this._socket);
            }
            return;
        }
        this._startQueued = true;
        if (!this._workerProcess) {
            this._workerProcess = cp.fork('analog', './analogworker.js');
        }
    }

    stop() {
        if (this._socket && this._started) {
            ipc.emit('analog.control', { action: 'stop' }, this._socket);
        }
    }

    kill() {
        this._socket.end();
        this._socket = undefined;
        this._started = false;
        if (this._workerProcess) {
            this._workerProcess.kill();
            this._workerProcess = undefined;
        }
    }

    get ticking() {
        return this._started;
    }

    get tempo() {
        return this._bpm;
    }

    set tempo(bpm) {
        if (bpm && this._bpm !== bpm) {
            this._bpm = bpm;
            this._updateWorker();
            this.emit('set', { bpm });
        }
    }

    requestVolume() {
        return new Promise((resolve, reject) => {
            this.once('config', (config) => {
                resolve(config);
            });
        });
    }

    get volume() {
        return this._volume;
    }

    set volume(level) {
        if (typeof level === 'number') {
            level = tools.clipToRange(Math.abs(level), 0.0, 1.0);
            this._volume = level;
            this._updateWorker({ volume: level });
            this.emit('set', { volume: level });
        }
    }
}

// TODO: figure out logic for sharing ticks/pulses with multiple ppqn. master:24ppqn,slave:2ppqn - this would work due to the easy even numbers... non-multiples wouldn't be able to share since this blocks the thread its on. non-multiples would require multiple threads spun up.
class Clock {
    constructor({ bpm = 120, ppqn = 24, patternLength = 16, tapEnabled = true, inputs = [], outputs = [], analog = false, adjusters } = {}) {
        // TODO: Add play queueing, play immediately features. Stop queueing as well? (fires at end of current pattern) If not queued, should a sequence position be sent to sync device sequencers?
        this._playing = false;
        this._paused = false;
        this._inputs = [];
        this._inputIndex = {};
        this._outputs = [];
        this._outputIndex = {};
        this.tapEnabled = tapEnabled;
        this._tapTimes = [];
        this._clock = new DigitalClockMaster({ bpm, ppqn, patternLength });
        this.analog = analog;
        this._setupClockBindings();
        this._inputMessageFilter = new MessageTypeFilter([
            new Adjuster({
                name: 'play-pause',
                description: 'Play / Pause clock playback.',
                potPickup: false,
                type: 0x0B,
                triggerMap: {
                    controller: true,
                    value: 127
                },
                handler: () => {
                    if (this.playing) {
                        if (this.paused) {
                            this.unpause();
                        } else {
                            this.pause();
                        }
                    } else {
                        this.play();
                    }
                }
            }),
            new Adjuster({
                name: 'stop',
                description: 'Stop clock playback.',
                potPickup: false,
                type: 0x0B,
                triggerMap: {
                    controller: true,
                    value: 127
                },
                handler: () => {
                    this.stop();
                }
            }),
            new Adjuster({
                name: 'tempo',
                description: 'Adjust clock tempo.',
                potPickup: true,
                type: 0x0B,
                triggerMap: {
                    controller: true
                },
                valueKey: 'value',
                handler: (value) => {
                    this.tempo = ((value + 1) * BPM_STEPS) + BPM_MIN;
                }
            }),
        ]);
        if (adjusters) {
            this.adjusters = adjusters;
        }
        if (Array.isArray(inputs)) {
            this.addInputs(... inputs);
        }
        if (Array.isArray(outputs)) {
            this.addOutputs(... outputs);
        }
        this._onMessage = (device, message) => {
            return this._inputMessageFilter.process(message) === true;
        }
    }

    _setupClockBindings() {
        this._clock.on('tick', (tick, ticks) => {
            // TODO: check tick pattern position, move any queued outputs into _outputs if ready
            this._send(MIDI_CLOCK);
        });
        this._clock.on('start', () => {
            this._send(MIDI_START);
        });
        let onStopOnPause = () => {
            this._send(MIDI_STOP);
        };
        this._clock.on('stop', onStopOnPause);
        this._clock.on('pause', onStopOnPause);
        this._clock.on('unpause', () => {
            this._send(MIDI_CONT);
        });
    }

    get adjusters() {
        return this._inputMessageFilter.adjusters;
    }

    set adjusters(adjusters) {
        this._inputMessageFilter.adjusters = adjusters;
    }

    get analog() {
        return !!this._analog;
    }

    set analog(enabled) {
        if (enabled && !this._analog) {
            this._analog = new AnalogClockMaster({ bpm: this.tempo });
        } else if (!enabled && !!this._analog) {
            this._analog.kill();
            this._analog = undefined;
        }
    }

    get outputs() {
        return [... this._outputs];
    }

    get tapEnabled() {
        return this._tapEnabled;
    }

    set tapEnabled(enabled) {
        if (typeof enabled !== 'boolean') {
            throw "Value must be a boolean!";
        }
        this._tapEnabled = enabled;
    }

    get tempo() {
        return this._clock.tempo;
    }

    set tempo(bpm) {
        this._clock.tempo = bpm;
        if (this._analog) {
            this._analog.tempo = bpm;
        }
    }

    get patternLength() {
        return this._clock.patternLength;
    }

    set patternLength(quarterNotes) {
        this._clock.patternLength = quarterNotes;
    }

    get ppqn() {
        return this._clock.ppqn;
    }

    get playing() {
        return this._playing;
    }

    get paused() {
        return this._playing && this._paused;   // TODO: is ._playing check necessary/desired?
    }

    _send(bytes) {
        for (let output of this._outputs) {
            output.sendMessage(bytes);
        }
    }

    // noinspection JSMethodCanBeStatic
    _indexDevice(index, device) {
        if (!index[device.name]) {
            index[device.name] = {};
        }
        index[device.name][device.port] = true;
    }

    // noinspection JSMethodCanBeStatic
    _isDeviceIndexed(index, device) {
        return !!index[device.name] && !!index[device.name][device.port];
    }

    // noinspection JSMethodCanBeStatic
    _unlistDevice(index, device) {
        if (index[device.name]) {
            if (index[device.name][device.port]) {
                delete index[device.name][device.port];
            }
            if (!Object.keys(index[device.name]).length) {
                delete index[device.name];
            }
        }
    }

    addInputs(... inputs) {
        for (let input of inputs) {
            if (input instanceof Input) {
                if (!this._isDeviceIndexed(this._inputIndex, input)) {
                    input.bind(this._onMessage, true);
                    this._inputs.push(input);
                    this._indexDevice(this._inputIndex, input);
                } else {
                    logger.warn(`Input was already added to clock. Skipping. (${input})`);
                }
            } else {
                logger.warn(`Invalid entry provided as an Input. (${input})`);
            }
        }
    }

    addOutputs(... outputs) {
        // TODO: address queuing option if clocks are already running
        for (let output of outputs) {
            if (output instanceof Output) {
                if (!this._isDeviceIndexed(this._outputIndex, output)) {
                    this._outputs.push(output);
                    this._indexDevice(this._outputIndex, output);
                } else {
                    logger.warn(`Output was already added to clock. SKipping. (${output})`);
                }
            } else {
                logger.warn(`Invalid entry provided as an Output. (${output})`);
            }
        }
    }

    removeInputs(... inputs) {
        for (let input of inputs) {
            if (input instanceof Input) {
                if (this._isDeviceIndexed(this._inputIndex, input)) {
                    input.unbind(this._onMessage);
                    this._unlistDevice(this._inputIndex, input);
                    tools.removeFromArray(input, this._inputs);
                }
            }
        }
    }

    removeOutputs(... outputs) {
        for (let output of outputs) {
            if (output instanceof Output) {
                if (this._isDeviceIndexed(this._outputIndex, output)) {
                    this._unlistDevice(this._outputIndex, output);
                    tools.removeFromArray(output, this._outputs);
                }
            }
        }
    }

    play() {
        if (this._playing) {
            return;
        }
        this._playing = true;
        this._clock.start();
    }

    pause() {
        if (!this._playing || this._paused) {
            return;
        }
        this._paused = true;
        this._clock.pause();
    }

    unpause() {
        if (!this._playing || !this._paused) {
            return;
        }
        this._clock.unpause();
        this._paused = false;
    }

    stop() {
        if (!this._playing) {
            return;
        }
        for (let { clock } of this._clocks) {
            clock.stop();
        }
        this._playing = false;
        this._paused = false;
    }

    tap() {
        if (!this._tapEnabled) {
            return;
        }
        this._tapTimes.push(tools.now());
        while (this._tapTimes.length > 5) {
            this._tapTimes.shift();
        }
        if (this._tapTimes.length >= 3) {
            let sum = 0, num = 0;
            // TODO: make sure the loop logic works. Alternatively, unshift new timeouts to front of the array and proceed forwards.
            for (let i = this._tapTimes.length - 1; i > 0; i--) {
                let newer = this._tapTimes[i];
                let older = this._tapTimes[i - 1];
                let diff = newer - older;
                if (diff > TAP_TIMEOUT) {
                    // Skipping value
                    continue;
                }
                sum += diff;
                num += 1;
            }
            if (num >= 2) {
                let interval = sum / num;
                this.tempo = Math.round(MINUTE_IN_NANOSECONDS / interval);
            }
        }
    }
}

module.exports = Clock;