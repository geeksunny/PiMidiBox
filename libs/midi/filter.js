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

module.exports = { Filter, ChannelFilter };