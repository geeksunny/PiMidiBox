const logger = require('log4js').getLogger();
const midi = require('./core');
const Clock = require('./clock');
const Filter = require('./filter');
const fs = require('fs');
const path = require('path');
const tools = require('../tools');

/**
 * onMessage callbacks handle incoming MIDI messages with regards to the mapping.
 *
 * @callback mappingMessageHandler
 * @param {Device} device - The MIDI device object sending the message.
 * @param {Message} message - MIDI message received from the input.
 * @param {Mapping} mapping - A reference to the mapping object issuing the message.
 */


/**
 * Base class for managing configuration records.
 */
class ConfigRecord {
    constructor() {
        // todo: is there anything that needs to be done here?
        if (new.target === ConfigRecord) {
            throw new TypeError("ConfigRecord is an abstract class and cannot be instantiated directly.");
        }
        this._reset();
    }

    _reset() {
        throw "Not implemented!";
    }

    _fromJson(json) {
        throw "Not implemented!";
    }

    fromJson(json) {
        this._reset();
        return this._fromJson(json);
    }

    _toJson() {
        throw "Not implemented!";
    }

    toJson() {
        // TODO: Is there anything required here?
        return this._toJson();
    }

    _fromRouter(router) {
        throw "Not implemented!";
    }

    fromRouter(router) {
        this._reset();
        return this._fromRouter(router);
    }

    _toRouter(router) {
        throw "Not implemented!";
    }

    toRouter(router) {
        // TODO: Is there anything required here?
        return this._toRouter(router);
    }
}

/**
 * TODO
 */
class DeviceRecord extends ConfigRecord {
    _reset() {
        this._name = undefined;
        this._port = undefined;
    }

    _fromJson(json) {
        this._name = json.name;
        this._port = json.port;
    }

    _toJson() {
        return {
            name: this._name,
            port: this._port
        };
    }

    _fromRouter(router) {
        //
    }

    _toRouter(router) {
        //
    }
}

/**
 * TODO
 */
class ClockRecord extends ConfigRecord {
    _reset() {
        this._outputs = [];
        this._bpm = 120;
        this._ppqn = 24;
        this._patternLength = 16;
        this._tapEnabled = false;
    }

    _fromJson(json) {
        if (!tools.isEmpty(json.outputs)) {
            // TODO: Validate before add?
            this._outputs.push(... json.outputs);
        }
        if (json.bpm) {
            this._bpm = json.bpm;
        }
        if (json.ppqn) {
            this._ppqn = json.ppqn;
        }
        if (json.patternLength) {
            this._patternLength = json.patternLength;
        }
        if (json.tapEnabled) {
            this._tapEnabled = json.tapEnabled;
        }
    }

    _toJson() {
        return {
            outputs: this._outputs,
            bpm: this._bpm,
            ppqn: this._ppqn,
            patternLength: this._patternLength,
            tapEnabled: this._tapEnabled
        };
    }

    _fromRouter(router) {
        //
    }

    _toRouter(router) {
        //
    }
}

/**
 * TODO
 */
class OptionsRecord extends ConfigRecord {
    _reset() {
        this._hotplug = true;
        this._syncConfigToUsb = true;
        this._verbose = false;
    }

    _fromJson(json) {
        if (json.hotplug) {
            this._hotplug = json.hotplug;
        }
        if (json.syncConfigToUsb) {
            this._syncConfigToUsb = json.syncConfigToUsb;
        }
        if (json.verbose) {
            this._verbose = json.verbose;
        }
    }

    _toJson() {
        return {
            hotplug: this._hotplug,
            syncConfigToUsb: this._syncConfigToUsb,
            verbose: this._verbose
        };
    }

    _fromRouter(router) {
        //
    }

    _toRouter(router) {
        //
    }
}

/**
 * Class for managing the record of a Mapping configuration.
 */
class MappingRecord extends ConfigRecord {
    _reset() {
        this._inputs = [];
        this._outputs = [];
        this._channels = undefined;
        this._velocity = undefined;
        this._listen = undefined;
    }

    _fromJson(json) {
        if (!tools.isEmpty(json.inputs)) {
            // TODO: Validate before add?
            this._inputs.push(... json.inputs);
        }
        if (!tools.isEmpty(json.outputs)) {
            // TODO: Validate before add?
            this._outputs.push(... json.outputs);
        }
        if (!tools.isEmpty(json.channels)) {
            this._channels = json.channels;
        }
        if (!tools.isEmpty(json.velocity)) {
            this._velocity = json.velocity;
        }
        if (!tools.isEmpty(json.listen)) {
            this._listen = json.listen;
        }
    }

    _toJson() {
        let result = {
            inputs: this._inputs,
            outputs: this._outputs
        };
        if (this._channels) {
            result.channels = this._channels;
        }
        if (this._velocity) {
            result.velocity = this._velocity;
        }
        if (this._listen) {
            result.listen = this._listen;
        }
        return result;
    }

    _fromRouter(router) {
        //
    }

    _toRouter(router) {
        //
    }
}

/**
 * Class for managing the contents of the Router's configuration.
 */
class Configuration extends ConfigRecord {
    static fromFile(filePath) {
        // todo
    }

    _reset() {
        this._devices = {};
        this._mappings = {};
        this._clock = new ClockRecord();
        this._options = new OptionsRecord();
    }

    _fromJson(json) {
        if (json.devices) {
            for (let name in json.devices) {
                this._devices[name] = new DeviceRecord();
                this._devices[name].fromJson(json.devices[name]);
            }
        }
        if (json.mappings) {
            for (let name in json.mappings) {
                this._mappings[name] = new MappingRecord();
                this._mappings[name].fromJson(json.mappings[name]);
            }
        }
        this._clock.fromJson(json.clock);
        this._options.fromJson(json.options);
    }

    _toJson() {
        let result = {
            devices: {},
            mappings: {},
            clock: this._clock.toJson(),
            options: this._options.toJson()
        };
        // Device records
        for (let name in this._devices) {
            result.devices[name] = this._devices[name].toJson();
        }
        // Mapping records
        for (let name in this._mappings) {
            result.mappings[name] = this._mappings[name].toJson();
        }
        return result;
    }

    _fromRouter(router) {
        //
    }

    _toRouter(router) {
        //
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

    /**
     * Get an array of the mapping's filters.
     * @returns {Filter[]}
     */
    get filters() {
        return [... this._filters];
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

// TODO: Allow this to be configured within syncConfigToUsb object.
const SYNCED_CONFIG_FILENAME = "pimidbox.config.json";

class Router {
    constructor() {
        this._mappings = {};
        this._started = false;
        this._paused = false;
        this._clock = undefined;
    }

    get config() {
        // TODO: create json of current config ready to save to disk.
    }

    pause() {
        if (this._started && !this._paused) {
            this._paused = true;
        }
    }

    unpause() {
        if (this._started && this._paused) {
            this._paused = false;
        }
    }

    toggle() {
        if (this._started) {
            this._paused = !this._paused;
        }
    }

    stop() {
        if (this._started) {
            this._started = false;
            this._paused = false;
            for (let name in this._mappings) {
                this.removeMapping(name);
            }
        }
    }

    /**
     * Start the router with a json configuration file.
     * @param {string} path - Path to the json configuration file.
     * @returns {boolean} - True if the router was started successfully.
     */
    loadConfig(path) {
        // TODO: Restructure config loading to allow for simple reloading
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
            // TODO: Move this method into outer class for readability
            // logger.debug(`m: ${device.name} - outputs: ${mapping.outputs.length} || ${JSON.stringify(message)}`);
            if (this._paused || !this._started) {
                return;
            }
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
                { type: Filter.ChannelFilter, key: "channels" },
                { type: Filter.VelocityFilter, key: "velocity" },
                { type: Filter.ChordFilter, key: "chord" }
            ];
            for (let { type, key } of review) {
                if (mapCfg[key]) {
                    filters.push(new type(mapCfg[key]));
                }
            }
            this.addMapping(mapName, inputs, outputs, filters, onMessage);
        }
        if (config.clock) {
            this._clock = new Clock(config.clock);
            let outputs = midi.Core.openOutputs(... getPortRecords(config.devices, config.clock.outputs));
            this._clock.add(... outputs);
        }
        midi.Core.hotplug = config.options.hotplug;
        if (config.options.syncConfigToUsb) {
            this._usb = require('../usb');
            this._usb.Monitor.watchDrives((event, drive) => {
                if (event === this._usb.Event.REMOVE || drive.isSystem || drive.isReadOnly) {
                    return;
                }
                // TODO: Add in option for whitelist/blacklist of drives to ignore.
                for (let mountpoint of drive.mountpoints) {
                    let syncedConfigPath = path.join(mountpoint, SYNCED_CONFIG_FILENAME);
                    let fileExists = true;
                    try {
                        fs.accessSync(syncedConfigPath, fs.constants.R_OK | fs.constants.W_OK)
                    } catch (err) {
                        fileExists = false;
                    }
                    try {
                        let fd = fs.openSync(syncedConfigPath, 'a+');
                        let statsRemote = fs.statSync(syncedConfigPath);
                        let statsLocal = fs.statSync(path);
                        if (fileExists && statsRemote.mtimeMs > statsLocal.mtimeMs) {
                            // TODO: Copy USB config to hard drive, reload config.
                        } else {
                            // TODO: Copy config file to USB drive.
                            // TODO: Add "lastSynced" timestamp value into config file
                        }
                        break;  // If we've made it this far, that means the sync operation was successful.
                    } catch (e) {
                        logger.error(`Error occurred during USB config sync operation.\n${err}`);
                    }
                }
                drive.unmount().catch((reason) => {
                    logger.error(`Error unmounting USB drive!\n${reason}`);
                });
            })
        }
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