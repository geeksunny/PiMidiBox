const midi = require('./core');
const Filter = require('./filter');

/**
 * onMessage callbacks handle incoming MIDI messages with regards to the mapping.
 *
 * @callback mappingMessageHandler
 * @param {Device} device - The MIDI device object sending the message.
 * @param {Message} message - MIDI message received from the input.
 * @param {Mapping} mapping - A reference to the mapping object issuing the message.
 */

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
            if (!(filter instanceof Filter.Filter)) {
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

class Router {
    constructor() {
        this._mappings = {};
        this._started = false;
    }

    // TODO: Clock master / relay
    // TODO: Add MIDI-CC mapping to alter filters on-the-fly (ie cycling chords in chord filter)
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
            let review = [
                {type: Filter.ChannelFilter, key: "channels"},
                {type: Filter.VelocityFilter, key: "velocity"},
                {type: Filter.ChordFilter, key: "chord"}
            ];
            for (let {type, key} of review) {
                if (mapCfg[key]) {
                    filters.push(new type(mapCfg[key]));
                }
            }
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


module.exports = { Router };