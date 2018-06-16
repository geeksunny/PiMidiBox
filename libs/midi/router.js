const midi = require('./core');

/**
 * onMessage callbacks handle incoming MIDI messages with regards to the mapping.
 *
 * @callback mappingMessageHandler
 * @param {Device} device - The MIDI device object sending the message.
 * @param {Message} message - MIDI message received from the input.
 * @param {Mapping} mapping - A reference to the mapping object issuing the message.
 */

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
    constructor({whitelist = [], blacklist = [], map = {}}/* = {}/*TODO: Leaving this default assignment in would make all arguments option? VERIFY*/) {
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
        let channel = message.msg.channel + 1;
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
            return midi.Message.parse(message.type, {channel: this._map[channel] - 1});
        }
        return message;
    }
}

/**
 * Class to facilitate the mapping of MIDI messages from multiple inputs to multiple outputs.
 */
class Mapping {
    /**
     *
     * @param {Input[]} inputs - Array of inputs to map from.
     * @param {Output[]} outputs - Array of Outputs to map to.
     */
    constructor(inputs = [], outputs = []) {
        // TODO: Validate inputs/outputs?
        this._inputs = [... inputs];
        this._outputs = [... outputs];
        this._filters = [];
        this._activated = false;
        this._onMessage = undefined;
    }

    /**
     * Get an array of the mapping's inputs.
     * @returns {Input[]}
     */
    get inputs() {
        return [... this._inputs];
    }

    /**
     * Get an array of the mapping's outputs.
     * @returns {Output[]}
     */
    get outputs() {
        return [... this._outputs];
    }

    addFilters(... filters) {
        for (let filter of filters) {
            if (!(filter instanceof Filter)) {
                throw "Filter must extend the Filter class.";
            }
            if (this._filters.indexOf(filter) > -1) {
                continue;
            }
            this._filters.push(filter);
        }
    }

    process(message) {
        let result = [message];
        for (let filter of this._filters) {
            let next = [];
            for (let msg of result) {
                let processed = filter.process(msg);
                if (!processed) {
                    return false;
                }
                next.push.apply(next, (Array.isArray(processed)) ? processed : [processed]);
            }
            result = [... next];
        }
        return result;
    }

    /**
     * Activate message handling on this mapping's inputs.
     * @param {mappingMessageHandler} onMessage - Callback function for handling input messages.
     * @returns {boolean} - True if the mapping was successfully activated.
     */
    activate(onMessage) {
        if (this._activated) {
            return false;
        }
        this._activated = true;
        if (!onMessage || !(onMessage instanceof Function)) {
            // TODO: Print warning / throw error?
            return false;
        }
        this._onMessage = (device, message) => {
            onMessage(device, message, this);
        };
        for (let input of this._inputs) {
            input.bind(this._onMessage);
        }
        return true;
    }

    /**
     * Deactivate message handling on this mapping's inputs.
     * @returns {boolean} - True if the mapping was successfully deactivated.
     */
    deactivate() {
        if (!this._activated) {
            return false;
        }
        this._activated = false;
        for (let input of this._inputs) {
            input.unbind(this._onMessage);
        }
        delete this._onMessage;
        return true;
    }

    /**
     * Send a message to all outputs of this mapping.
     * @param {Message} message - The message to send.
     */
    broadcast(message) {
        // TODO: allow message to be an array / ...argument
        for (let output of this._outputs) {
            output.sendMessage(message);
        }
    }
}

// TODO: Add listen-* options
class Router {
    constructor() {
        this._mappings = {};
        this._started = false;
    }

    // TODO: Clock master / relay
    // TODO: Add chord filter
    // TODO: Add velocity regulation filter
    // TODO: Add enable/disable feature for temporarily stopping all routing.

    /**
     * Start the router with a json configuration file.
     * @param {string} path - Path to the json configuration file.
     * @returns {boolean} - True if the router was started successfully.
     */
    loadConfig(path) {
        if (this._started) {
            // TODO: Print warning?
            return false;
        }
        let getPortRecords = (records, requested) => {
            let reviewed = [], result = [];
            let request;
            while ((requested.length > 0) && (request = requested.shift())) {
                if (reviewed.includes(request)) {
                    continue;
                }
                let record = records[request];
                if (record) {
                    record.nickname = request;
                    result.push(record);
                }
                reviewed.push(request);
            }
            return result;
        };
        let onMessage = (device, message, mapping) => {
            // console.log(`m: ${device.name} - outputs: ${mapping.outputs.length} || ${JSON.stringify(message)}`);
            let processed = mapping.process(message);
            if (processed) {
                for (let msg of processed) {
                    mapping.broadcast(msg.bytes);
                }
            }
        };
        let config = require(path);
        if (config && config.mappings) {
            this._started = true;
        }
        for (let mapName in config.mappings) {
            let mapCfg = config.mappings[mapName];
            // TODO: listenFlags should probably be on input-by-input basis rather than whole mapping
            let inputs = midi.Core.openInputs(mapCfg.listen, ... getPortRecords(config.devices, mapCfg.inputs));
            let outputs = midi.Core.openOutputs(... getPortRecords(config.devices, mapCfg.outputs));
            let filters = [];
            if (mapCfg.channels) {
                filters.push(new ChannelFilter(mapCfg.channels));
            }
            // TODO: Iterate through remaining filters here when added.
            this.addMapping(mapName, inputs, outputs, filters, onMessage);
        }
        midi.Core.hotplug = config.options.hotplug;
        // TODO: Implement config.options.verbose [GLOBAL SCALE?]
        return true;
    }

    /**
     * Add a new MIDI mapping to this router.
     * @param {string} name - Name of the mapping.
     * @param {Input[]} inputs - Array of Inputs to map from.
     * @param {Output[]} outputs - Array of Outputs to map to.
     * @param {Filter[]} filters - Array of filters to apply to this mapping.
     * @param {mappingMessageHandler} onMessage - Callback function for handling input messages.
     */
    addMapping(name, inputs, outputs, filters, onMessage) {
        if (this._mappings[name]) {
            // Mapping by this name already exists.
            // TODO: Print warning?
            return;
        }
        this._mappings[name] = new Mapping(inputs, outputs);
        if (filters) {
            this._mappings[name].addFilters(... filters);
        }
        this._mappings[name].activate(onMessage);
    }

    /**
     * Remove a specific mapping.
     * @param {string} name - The name of the mapping to be removed.
     */
    removeMapping(name) {
        if (!this._mappings[name]) {
            // TODO: Print warning?
            return;
        }
        this._mappings[name].deactivate();
        delete this._mappings[name];
    }

    onExit() {
        for (let name in this._mappings) {
            this._mappings[name].deactivate();
            delete this._mappings[name];
        }
        midi.Core.onExit();
    }
}


module.exports = { Router, Filter, ChannelFilter };