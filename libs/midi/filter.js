const tools = require('../tools');

/**
 * Interface for filters processing received MIDI messages.
 *
 * @interface
 */
class Filter {
    constructor() {
        //
    }

    /**
     * Process a given MIDI message with this
     * @param {Message} message - The MIDI message to be processed.
     * @returns {Message|Message[]|boolean} The message or array of messages to be passed down the line.
     * Return `false` to cancel the message from being passed along.
     */
    process(message) {
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
        this._whitelist = ChannelFilter._makeList(... whitelist);
        this._blacklist = ChannelFilter._makeList(... blacklist);
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

    process(message) {
        let channel = message.channel + 1;
        if (!!this._whitelist.length) {
            if (!(channel in this._whitelist)) {
                console.log(`Channel is not whitelisted! ${channel}`);
                return false;
            }
        } else if (!!this._blacklist.length) {
            if (channel in this._blacklist) {
                console.log(`Blacklisted!! ${channel}`);
                return false;
            }
        }
        if (channel.toString() in this._map) {
            console.log(`Remapped! ${channel}->${this._map[channel]}`);
            // TODO: Revisit when midi.Message has been rewritten
            message.channel = this._map[channel] - 1;
        }
        return message;
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
        this._min = tools.clipToRange(min, Velocity.min, Velocity.max);
        this._max = tools.clipToRange(max, this._min, Velocity.max);
        this.mode = mode;
    }

    set mode(mode) {
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

    process(message) {
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
}

module.exports = { Filter, ChannelFilter, VelocityFilter };