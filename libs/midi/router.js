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
 * Class to facilitate the mapping of MIDI messages from multiple inputs to multiple outputs.
 */
class Mapping {
    // TODO: Channel filters; inputs only listen for messages on given channels, outputs only receive messages sent for given channels
    // TODO: Features ala chord mode, etc are enabled / present here in the mapping class.

    /**
     *
     * @param {Input[]} inputs - Array of inputs to map from.
     * @param {Output[]} outputs - Array of Outputs to map to.
     */
    constructor(inputs = [], outputs = []) {
        // TODO: Validate inputs/outputs?
        this._inputs = [... inputs];
        this._outputs = [... outputs];
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
        for (let i in this._outputs) {
            let output = this._outputs[i];
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
    // TODO: Add chord feature
    // TODO: Add velocity regulation feature
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
                record.nickname = request;
                result.push(record);
                reviewed.push(request);
            }
            return result;
        };
        let onMessage = (device, message, mapping) => {
            console.log(`m: ${JSON.stringify(message)}`);
            mapping.broadcast(message.bytes);
        };
        let config = require(path);
        if (config && config.mappings) {
            this._started = true;
        }
        for (let mapName in config.mappings) {
            let mapCfg = config.mappings[mapName];
            // TODO: listenFlags should probably be on input-by-input basis rather than whole mapping
            let inputs = midi.openInputs(mapCfg.listen, ... getPortRecords(config.devices, mapCfg.inputs));
            let outputs = midi.openOutputs(... getPortRecords(config.devices, mapCfg.outputs));
            this.addMapping(mapName, inputs, outputs, onMessage);
        }
        midi.hotplug = config.options.hotplug;
        return true;
    }

    /**
     * Add a new MIDI mapping to this router.
     * @param {string} name - Name of the mapping.
     * @param {Input[]} inputs - Array of Inputs to map from.
     * @param {Output[]} outputs - Array of Outputs to map to.
     * @param {mappingMessageHandler} onMessage - Callback function for handling input messages.
     */
    addMapping(name, inputs, outputs, onMessage) {
        if (this._mappings[name]) {
            // Mapping by this name already exists.
            // TODO: Print warning?
            return;
        }
        this._mappings[name] = new Mapping(inputs, outputs);
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
}


module.exports = Router;