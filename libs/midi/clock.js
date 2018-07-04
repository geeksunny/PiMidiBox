const EventEmitter = require('eventemitter3');
const cp = require('../childprocess');
const ipc = require('../../config/ipc').request('master');
const {Message} = require('./core');
const tools = require('../tools');

// TODO: Add configuration option for microseconds over nanoseconds
const MINUTE_IN_MICROSECONDS = 60 * 1e6;
const MINUTE_IN_NANOSECONDS = 60 * 1e9;

const BPM_MIN = 60;
const BPM_MAX = 300;

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
 * Master class for coordinating with and controlling the Clock Worker.
 */
class Master extends EventEmitter {
    // TODO: add logic for swing. (Is this even possible through midi clock signals?)
    // TODO: add 'wholenote', 'quarternote', etc events?
    constructor({ppqn = 24, bpm = 120, patternLength = 16} = {}) {
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
        ipc.server.on('clock.ready', (data, socket) => {
            this._socket = socket;
            this._updateWorker();
        });
        ipc.server.on('clock.tick', () => {
            this.emit('tick', {
                tick: new Tick(this._pos++, this._ppqn, this._patternLength),
                ticks: ++this._ticks
            });
        });
        ipc.server.on('clock.state', ({started}) => {
            if (typeof started !== 'boolean') {
                console.log(`Unsupported type passed for 'clock.state.started' (${typeof started}), requires boolean.`);
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
        ipc.server.on('clock.error', ({message}) => {
            console.error(`Clock error occurred!\n${message}`);
        });
    }

    _updateWorker() {
        if (this._socket) {
            ipc.server.emit(this._socket, 'clock.config', {tickLength: this._tickLength});
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
                ipc.server.emit(this._socket, 'clock.control', {action: 'start'});
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
            ipc.server.emit(this._socket, 'clock.control', {action: 'stop'});
            this._pos = 0;
            this._ticks = 0;
        }
    }

    pause() {
        if (this._socket && (this._started && !this._paused)) {
            this._paused = true;
            ipc.server.emit(this._socket, 'clock.control', {action: 'stop'});
        }
    }

    unpause() {
        if (this._socket && (this._started && this._paused)) {
            ipc.server.emit(this._socket, 'clock.control', {action: 'start'});
        }
    }

    kill() {
        // TODO: kill worker process, delete this._socket
    }

    get ticking() {
        return this._started && !this._paused;
    }

    set tempo(bpm) {
        let _bpm = tools.clipToRange(bpm, BPM_MIN, BPM_MAX);
        if (_bpm !== bpm) {
            console.log(`Invalid BPM (${bpm}) - Clipping to ${_bpm}`);
            bpm = _bpm;
        }
        if (this._bpm !== bpm) {
            this._bpm = bpm;
            this._tickLength = MINUTE_IN_NANOSECONDS / (this._bpm * this._ppqn);
            this._updateWorker();
            this.emit('set', {bpm});
        }
    }

    get tempo() {
        return this._bpm;
    }

    set patternLength(quarterNotes) {
        this._patternLength = quarterNotes;
        this.emit('set', {patternLength: quarterNotes});
    }

    get patternLength() {
        return this._patternLength;
    }
}

// TODO: figure out logic for sharing ticks/pulses with multiple ppqn. master:24ppqn,slave:2ppqn - this would work due to the easy even numbers... non-multiples wouldn't be able to share since this blocks the thread its on. non-multiples would require multiple threads spun up.
class Clock {
    constructor(bpm = 120, ppqn = 24, patternLength = 16) {
        // TODO: Add play queueing, play immediately features. Stop queueing as well? (fires at end of current pattern) If not queued, should a sequence position be sent to sync device sequencers?
        this._playing = false;
        this._paused = false;
        this._outputs = [];
        this._clock = new Master({bpm, ppqn, patternLength});
        this._clock.on('tick', this._onTick);
        this._clock.on('start', this._onStart);
        this._clock.on('stop', this._onStopOnPause);
        this._clock.on('pause', this._onStopOnPause);
        this._clock.on('unpause', this._onUnpause);
    }

    set tempo(bpm) {
        this._clock.tempo = bpm;
    }

    set patternLength(quarterNotes) {
        this._clock.patternLength = quarterNotes;
    }

    get playing() {
        return this._playing;
    }

    get paused() {
        return this._playing && this._paused;   // TODO: is ._playing check necessary/desired?
    }

    _onTick(tick, ticks) {
        // TODO: check tick pattern position, move any queued outputs into _outputs if ready
        this._send(MIDI_CLOCK);
    }

    _onStart() {
        this._send(MIDI_START);
    }

    _onStopOnPause() {
        this._send(MIDI_STOP);
    }

    _onUnpause() {
        this._send(MIDI_CONT);
    }

    _send(bytes) {
        for (let output of this._outputs) {
            output.sendMessage(bytes);
        }
    }

    add(... outputs) {
        // TODO: address queuing option if clocks are already running
        // TODO: should we enforce a no-duplicate output rule here? probably yes? we can use output.name/port for matching/indexing
        this._outputs.push(... outputs);
    }

    remove(... outputs) {
        // TODO: remove outputs from this._outputs
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
        for (let {clock} of this._clocks) {
            clock.stop();
        }
        this._playing = false;
        this._paused = false;
    }
}

module.exports = Clock;