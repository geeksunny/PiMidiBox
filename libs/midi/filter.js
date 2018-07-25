const logger = require('log4js').getLogger();
const tools = require('../tools');
const { Message } = require('./core');

/**
 * Interface for filters processing received MIDI messages.
 *
 * @interface
 */
class Filter {
    constructor() {
        this._paused = false;
    }

    pause() {
        if (!this._paused) {
            this._paused = true;
        }
    }

    unpause() {
        if (this._paused) {
            this._paused = false;
        }
    }

    toggle() {
        this._paused = !this._paused;
    }

    get paused() {
        return this._paused;
    }

    process(message) {
        return (this._paused) ? message : this._process(message);
    }

    /**
     * Process a given MIDI message with this
     * @param {Message} message - The MIDI message to be processed.
     * @returns {Message|Message[]|boolean} The message or array of messages to be passed down the line.
     * Return `false` to cancel the message from being passed along.
     */
    _process(message) {
        throw "Not implemented!";
    }

    /**
     * Returns an object representing the current settings of the filter.
     */
    get settings() {
        throw "Not implemented!";
    }
}

class ChannelFilter extends Filter {
    /**
     * TODO: desc
     * @param {Object} opts - An object containing one or more of the parameters listed below.
     * If both a whitelist and blacklist is provided, the blacklist will be ignored.
     * @param {Number[]} [opts.whitelist] - An array of integers representing the only channels to be listened to.
     * Messages on all other channels will be ignored.
     * @param {Number[]} [opts.blacklist] - An array of integers representing the only channels to be ignored.
     * Messages on all other channels will be processed.
     * @param {Object} [opts.map] - an object mapping input channels to a different output channel.
     * @example <caption>Example of a channel mapping.</caption>
     * // Input messages on channel 6 will be forwarded to 1, 7 to 2, 8 to 3.
     * { "6": 1, "7": 2, "8": 3 }
     */
    constructor({whitelist = [], blacklist = [], map = {}} = {}) {
        super();
        this._whitelist = whitelist;
        this._blacklist = blacklist;
        this._map = map;
    }

    static _makeList(... channels) {
        let result = [];
        for (let channel of channels) {
            result[channel] = true;
        }
        return result;
    }

    set whitelist(channels) {
        this._whitelist = ChannelFilter._makeList(... channels);
    }

    set blacklist(channels) {
        this._blacklist = ChannelFilter._makeList(... channels);
    }

    set map(map) {
        // TODO: validate values in map?
        this._map = map;
    }

    _process(message) {
        let channel = message.channel + 1;
        if (!!this._whitelist.length) {
            if (!(channel in this._whitelist)) {
                logger.debug(`Channel is not whitelisted! ${channel}`);
                return false;
            }
        } else if (!!this._blacklist.length) {
            if (channel in this._blacklist) {
                logger.debug(`Blacklisted!! ${channel}`);
                return false;
            }
        }
        if (channel.toString() in this._map) {
            logger.debug(`Remapped! ${channel}->${this._map[channel]}`);
            // TODO: Revisit when midi.Message has been rewritten
            message.channel = this._map[channel] - 1;
        }
        return message;
    }

    get settings() {
        let settings = {};
        if (!!this._whitelist.length) {
            settings.whitelist = this._whitelist;
        }
        if (!!this._blacklist.length) {
            settings.blacklist = this._blacklist;
        }
        if (!!Object.keys(this._map).length) {
            settings.map = this._map;
        }
        return settings;
    }
}

const Chord = {
    "MAJOR3": [0, 4, 7],    // Major, 3 notes
    "MINOR3": [0, 3, 7],    // Minor, 3 notes
    "MAJOR3_LO": [-5, 0, 4],
    "MINOR3_LO": [-5, 0, 3],
    "MAJOR2": [0, 4],       // Major, 2 notes
    "MINOR2": [0, 3],       // Minor, 2 notes
    "DIM": [0, 3, 6, 9],
    "AUG": [0, 4, 8, 10],
    "SUS2": [0, 2, 7],
    "SUS4": [0, 5, 7],
    "7SUS2": [0, 2, 7, 10],
    "7SUS4": [0, 5, 7, 10],
    "6TH": [0, 4, 7, 9],
    "7TH": [0, 4, 7, 10],
    "9TH": [0, 4, 7, 10, 14],
    "MAJOR7TH": [0, 4, 7, 11],
    "MAJOR9TH": [0, 4, 7, 11, 14],
    "MAJOR11TH": [0, 4, 7, 14, 17],
    "MINOR6TH": [0, 3, 7, 9],
    "MINOR7TH": [0, 3, 7, 10],
    "MINOR9TH": [0, 3, 7, 10, 14],
    "MINOR11TH": [0, 3, 7, 14, 17],
    "POWER2": [0, 7],
    "POWER3": [0, 7, 12],
    "OCTAVE2": [0, 12],
    "OCTAVE3": [0, 12, 24]
};

class ChordFilter extends Filter {
    /**
     * // TODO: desc
     * @param {Object} opts - An object containing one or more of the parameters listed below.
     * @param {string} opts.chord - The chord to filter notes into.
     * Valid Values:
     *  MAJOR2, MAJOR3, MAJOR3_LO, MAJOR7TH, MAJOR9TH, MAJOR11TH,
     *  MINOR2, MINOR3, MINOR3_LO, MINOR6TH, MINOR7TH, MINOR9TH, MINOR11TH,
     *  DIM, AUG, SUS2, SUS4, 7SUS2, 7SUS4, 6TH, 7TH, 9TH,
     *  POWER2, POWER3, OCTAVE2, OCTAVE3
     */
    constructor({chord} = {}) {
        super();
        if (!chord) {
            throw "Value required for `chord`.";
        }
        this.chord = chord;
    }

    set chord(chord) {
        if (!Chord[chord]) {
            throw "Unsupported value for `chord`.";
        }
        this._chord = chord;
        this._offsets = Chord[chord];
    }

    _process(message) {
        let result = [];
        for (let offset of this._offsets) {
            let note = message.note += offset;
            if (!tools.withinRange(note, 0, 127)) {
                continue;
            }
            let add = message.copy();
            add.note = note;
            result.push(add);
        }
        return result;
    }

    get settings() {
        return {
            chord: this._chord
        };
    }
}

class MessageTypeFilter extends Filter {
    /**
     * // TODO: desc
     * @param {Object} opts - An object containing one or more of the parameters listed below.
     * If both a whitelist and blacklist is provided, the blacklist will be ignored.
     * @param {Number[]|String[]} [whitelist] - An array of numbers or strings representing types of messages to allow through the filter.
     * @param {Number[]|String[]} [blacklist] - An array of numbers or strings representing types of messages to not allow through the filter.
     */
    constructor({whitelist = [], blacklist = []} = {}) {
        super();
        this.whitelist = whitelist;
        this.blacklist = blacklist;
    }

    static _makeList(... types) {
        let result = [];
        for (let type of types) {
            switch (typeof type) {
                case 'number':
                    if (type in Message.byteToStringTypeMap) {
                        result.push(type);
                    } // TODO: else, throw/warn?
                    break;
                case 'string':
                    if (type in Message.stringToByteTypeMap.basic) {
                        result.push(Message.stringToByteTypeMap.basic[type]);
                    } else if (type in Message.stringToByteTypeMap.extended) {
                        result.push(Message.stringToByteTypeMap.extended[type]);
                    } // TODO: else, throw/warn?
                    break;
            }
        }
        return result;
    }

    set whitelist(items) {
        this._whitelist = MessageTypeFilter._makeList(... items);
    }

    set blacklist(items) {
        this._blacklist = MessageTypeFilter._makeList(... items);
    }

    _process(message) {
        super._process(message);
        if (!!this._whitelist.length) {
            return (message.type in this._whitelist) ? message : false;
        } else if (!!this._blacklist.length) {
            return (message.type in this._blacklist) ? false : message;
        } else {
            return message;
        }
    }

    get settings() {
        let settings = {};
        if (!!this._whitelist.length) {
            settings.whitelist = this._whitelist;
        }
        if (!!this._blacklist.length) {
            settings.blacklist = this._blacklist;
        }
        return settings;
    }
}

class TransposeFilter extends Filter {
    /**
     * // TODO: desc
     * @param {Object} opts - An object containing one or more of the parameters listed below.
     * @param {Number} opts.step - The number of octaves to transpose notes to.
     */
    constructor({step} = {}) {
        super();
        this.step = step;
    }

    set step(value) {
        if (value > 10 || value < -10) {
            throw "Value of `step` must be between -10/+10";
        }
        this._step = value;
    }

    _process(message) {
        let scaled = message.note + (this._step * 12);
        message.note = tools.clipToRange(scaled, 0, 127);
        return message;
    }

    get settings() {
        return {
            step: this._step
        };
    }
}

const Velocity = {
    min: 0,
    max: 127 /*, mode: tools.enum('CLIP', 'DROP', 'SCALED')*/
};

class VelocityFilter extends Filter {
    /**
     * // TODO: desc
     * @param {Object} opts - An object containing one or more of the parameters listed below.
     * @param {Number} [opts.min] - The minimum allowable velocity value.
     * Must be an integer between 0-127. Default is 0.
     * @param {Number} [opts.max] - The maximum allowable velocity value.
     * Must be an integer between 0-127 and equal to or higher than `opts.min`. Default is 127.
     * @param {string} [opts.mode] - The mode for this filter to operate in. Default is `clip`.
     * * `clip` - Note velocity will be clipped to the value of `opts.min` or `opts.max` if the velocity is out of range.
     * * `drop` - Drop the note if velocity does not fall within the range of `opts.min` and `opts.max`.
     * * `scaled` - Note velocity will be scaled relative to the values of `opts.min` and `opts.max`.
     */
    constructor({min = Velocity.min, max = Velocity.max, mode = 'clip'} = {}) {
        super();
        this.min = min;
        this.max = max;
        this.mode = mode;
    }

    set mode(mode) {
        this._mode = mode;
        switch (mode) {
            case 'scaled':
                let scale = (this._max - this._min + 1) / 128;
                this._processor = (velocity) => {
                    return Math.round(velocity * scale) + this._min;
                };
                break;
            case 'drop':
                this._processor = (velocity) => {
                    return (tools.withinRange(velocity, this._min, this._max)) ? velocity : false;
                };
                break;
            case 'clip':
            default:
                this._processor = (velocity) => {
                    return tools.clipToRange(message.velocity, this._min, this._max);
                }
        }
    }

    set min(value) {
        this._min = tools.clipToRange(value, Velocity.min, Velocity.max);
    }

    set max(value) {
        this._max = tools.clipToRange(value, this._min, Velocity.max);
    }

    _process(message) {
        if (!message.hasOwnProperty('velocity')) {
            return message;
        }
        let processed = this._processor(message.velocity);
        if (processed === false) {
            return false;
        }
        message.velocity = processed;
        return message;
    }

    get settings() {
        return {
            min: this._min,
            max: this._max,
            mode: this._mode
        };
    }
}

module.exports = { Filter, ChannelFilter, ChordFilter, MessageTypeFilter, TransposeFilter, VelocityFilter };