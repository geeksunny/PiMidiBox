const EventEmitter = require('eventemitter3');
const cp = require('../childprocess');
const ipc = require('../../config/ipc').request('master');
const tools = require('../tools');

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
                ipc.server.emit(this._socket, 'clock.control', {action: 'start'});
                this.emit('start');
            }
            return;
        }
        this._startQueued = true;
        if (!this._workerProcess) {
            this._workerProcess = cp.fork('clock', './clockworker.js');
        }
    }

    stop() {
        if (this._socket) {
            if (this._started || this._ticks > 0) {
                ipc.server.emit(this._socket, 'clock.control', {action: 'stop'});
                this._pos = 0;
                this._ticks = 0;
                this.emit('stop');
            }
        }
    }

    pause() {
        // TODO: Should a _paused flag be used here?
        if (this._socket) {
            if (this._started) {
                ipc.server.emit(this._socket, 'clock.control', {action: 'stop'});
                this.emit('pause');
            }
        }
    }

    unpause() {
        // TODO
    }

    kill() {
        // TODO: kill worker process, delete this._socket
    }

    get ticking() {
        return this._started;
    }

    set tempo(bpm) {
        this._bpm = bpm;
        this._tickLength = 60000 / (this._bpm * this._ppqn);
        this._updateWorker();
        this.emit('set', {bpm});
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
        for (let output of this._outputs) {
            // TODO: handle Tick here
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

module.exports = { Clock };