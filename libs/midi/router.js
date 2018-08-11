const logger = require('log4js').getLogger();
const midi = require('./core');
const Clock = require('./clock');
const files = require('../files');
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
        this.name = undefined;
        this.port = undefined;
    }

    _fromJson(json) {
        this.name = json.name;
        this.port = json.port;
    }

    _toJson() {
        return {
            name: this.name,
            port: this.port
        };
    }
}

/**
 * TODO
 */
class ClockRecord extends ConfigRecord {
    _reset() {
        this._adjusters = {};
        this._inputs = [];
        this._outputs = [];
        this._bpm = 120;
        this._ppqn = 24;
        this._patternLength = 16;
        this._tapEnabled = false;
    }

    _fromJson(json) {
        if (json.adjusters) {
            this._adjusters = json.adjusters;
        }
        if (!tools.isEmpty(json.inputs)) {
            this._inputs.push(... json.inputs);
        }
        if (!tools.isEmpty(json.outputs)) {
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
            adjusters: this._adjusters,
            inputs: this._inputs,
            outputs: this._outputs,
            bpm: this._bpm,
            ppqn: this._ppqn,
            patternLength: this._patternLength,
            tapEnabled: this._tapEnabled
        };
    }

    _fromRouter(router) {
        let clock = router.clock;
        this._adjusters = clock.adjusters;
        for (let input of clock.inputs) {
            this._inputs.push(input.nickname);
        }
        for (let output of clock.outputs) {
            this._outputs.push(output.nickname);
        }
        this._bpm = clock.tempo;
        this._ppqn = clock.ppqn;
        this._patternLength = clock.patternLength;
        this._tapEnabled = clock.tapEnabled;
    }

    _toRouter(router) {
        let json = this._toJson();
        json.inputs = midi.Core.openInputs(... midi.PortIndex.gather(... this._inputs));
        json.outputs = midi.Core.openOutputs(... midi.PortIndex.gather(... this._outputs));
        router.clock = json;
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
        this._hotplug = router.hotplug;
        this._syncConfigToUsb = router.syncConfigToUsb;
        this._verbose = logger.level.toLowerCase() === 'all';
    }

    _toRouter(router) {
        router.hotplug = this._hotplug;
        router.syncConfigToUsb = this._syncConfigToUsb;
        logger.level = (this._verbose) ? 'all' : 'warn'; // TODO: error instead of warn?
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
}

/**
 * Class for managing the contents of the Router's configuration.
 */
class Configuration extends ConfigRecord {
    static fromFile(filePath) {
        let json = files.readFileAsJSON(filePath);
        if (json) {
            let config = new Configuration();
            config.fromJson(json);
            return config;
        } else {
            throw "Invalid data provided for Configuration!";
        }
    }

    _reset() {
        this._ignore = [];
        this._devices = {};
        this._mappings = {};
        this._clock = new ClockRecord();
        this._options = new OptionsRecord();
    }

    _fromJson(json) {
        if (json.ignore && Array.isArray(json.ignore)) {
            this._ignore = [... json.ignore];
        }
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
            ignore: [... this._ignore],
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
        this._ignore = [... midi.Core.ignoredDevices];
        let records = midi.PortIndex.records;
        for (let name in records) {
            let record = records[name];
            this._devices[name] = new DeviceRecord();
            this._devices[name].fromJson({ name: record.name, port: record.port });
        }
        let mappings = router.mappings;
        for (let name in mappings) {
            let mapping = mappings[name];
            let json = {
                inputs: [],
                outputs: []
            };
            for (let input of mapping.inputs) {
                json.inputs.push(input.nickname);
            }
            for (let output of mapping.outputs) {
                json.outputs.push(output.nickname);
            }
            for (let filter of mapping.filters) {
                let key;
                switch (filter.constructor) {
                    case Filter.ChannelFilter:
                        key = "channels";
                        break;
                    case Filter.VelocityFilter:
                        key = "velocity";
                        break;
                    case Filter.TransposeFilter:
                        key = "transpose";
                        break;
                    case Filter.ChordFilter:
                        key = "chord";
                        break;
                    default:
                        // Skipping unknown filters
                        continue;
                }
                json[key] = filter.settings;
            }
            this._mappings[name] = new MappingRecord();
            this._mappings[name].fromJson(json);
        }
        this._clock.fromRouter(router);
        this._options.fromRouter(router);
    }

    _toRouter(router) {
        midi.Core.ignoredDevices = this._ignore;
        midi.PortIndex.clear();
        for (let name in this._devices) {
            midi.PortIndex.put(name, this._devices[name]);
        }
        for (let name in this._mappings) {
            let record = this._mappings[name].toJson();
            let inputs = midi.Core.openInputs(record.listen, ... midi.PortIndex.gather(... record.inputs));
            let outputs = midi.Core.openOutputs(... midi.PortIndex.gather(... record.outputs));
            let filters = [];
            let review = [
                { type: Filter.ChannelFilter, key: "channels" },
                { type: Filter.VelocityFilter, key: "velocity" },
                { type: Filter.TransposeFilter, key: "transpose" },
                { type: Filter.ChordFilter, key: "chord" }
            ];
            for (let { type, key } of review) {
                if (record[key]) {
                    filters.push(new type(record[key]));
                }
            }
            router.addMapping(name, inputs, outputs, filters);
        }
        this._clock.toRouter(router);
        this._options.toRouter(router);
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

    /**
     * Process a given MIDI message through this Mapping's active Filters.
     * @param {Message} message - The MIDI message to be processed.
     * @returns {boolean|Message[]}
     *      * {boolean} true - The supplied Message was consumed and the message chain should be cancelled.
     *      * {boolean} false - The supplied Message should be suppressed. The message chain should continue.
     *      * {Message[]} - Resulting processed message(s) to broadcast to the mapping.
     */
    process(message) {
        let result = [message];
        for (let filter of this._filters) {
            let next = [];
            for (let msg of result) {
                let processed = filter.process(msg);
                if (typeof processed === 'boolean') {
                    return processed;
                } else if (processed) {
                    next.push.apply(next, (Array.isArray(processed)) ? processed : [processed]);
                }
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
        this._usb = undefined;
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
        let config = Configuration.fromFile(path);
        config.toRouter(this);
        this._started = true;
        return true;
    }

    /**
     * Add a new MIDI mapping to this router.
     * @param {string} name - Name of the mapping.
     * @param {Input[]} inputs - Array of Inputs to map from.
     * @param {Output[]} outputs - Array of Outputs to map to.
     * @param {Filter[]} filters - Array of filters to apply to this mapping.
     * @param {mappingMessageHandler} [onMessage] - Callback function for handling input messages.
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
        if (!onMessage) {
            onMessage = this._onMessage;
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

    _onMessage(device, message, mapping) {
        // logger.debug(`m: ${device.name} - outputs: ${mapping.outputs.length} || ${JSON.stringify(message)}`);
        if (this._paused || !this._started) {
            return;
        }
        let processed = mapping.process(message);
        if (processed === true) {
            return true;
        } else if (processed) {
            for (let msg of processed) {
                mapping.broadcast(msg.bytes);
            }
        }
    }

    _onDriveEvent(event, drive) {
        if (event === this._usb.Event.REMOVE || drive.isSystem || drive.isReadOnly) {
            return;
        }
        // TODO: Add in option for whitelist/blacklist of drives to ignore.
        for (let mountpoint of drive.mountpoints) {
            let syncedConfigPath = path.join(mountpoint, SYNCED_CONFIG_FILENAME);
            try {
                let fd = fs.openSync(syncedConfigPath, 'a+');
                if (files.canReadWrite(syncedConfigPath) && files.modifiedSoonerThan(syncedConfigPath, path)) {
                    // TODO: Copy USB config to hard drive, reload config.
                } else {
                    // TODO: Copy config file to USB drive.
                    // TODO: Add "lastSynced" timestamp value into config file ___OR___ be sure to touch local config at same time as sync
                }
                break;  // If we've made it this far, that means the sync operation was successful.
            } catch (e) {
                logger.error(`Error occurred during USB config sync operation.\n${err}`);
            }
        }
        drive.unmount().catch((reason) => {
            logger.error(`Error unmounting USB drive!\n${reason}`);
        });
    }

    onExit() {
        for (let name in this._mappings) {
            this._mappings[name].deactivate();
            delete this._mappings[name];
        }
        midi.Core.onExit();
    }

    sendSysex(path, output) {
        try {
            let message = midi.Message.fromSysexFile(path);
            let _record = midi.PortIndex.get(output) || midi.PortRecord.parse(output);
            let _output = midi.Core.openOutputs(_record)[0];
            _output.sendMessage(message.bytes);
        } catch (err) {
            logger.error(`Error occurred during sysex file send.\n${err}`);
        }
    }

    get clock() {
        return this._clock;
    }

    set clock(options) {
        if (!this._clock) {
            this._clock = new Clock(options);
        }
        // todo: if clock exists, should we update settings?
    }

    get mappings() {
        return this._mappings;
    }

    get hotplug() {
        return midi.Core.hotplug;
    }

    set hotplug(enabled) {
        if (midi.Core.hotplug !== enabled) {
            midi.Core.hotplug = enabled;
        }
    }

    get syncConfigToUsb() {
        return this._usb !== undefined;
    }

    set syncConfigToUsb(enabled) {
        if (this.syncConfigToUsb === enabled) {
            return;
        }
        if (enabled) {
            this._usb = require('../usb');
            this._usb.Monitor.watchDrives(this._onDriveEvent);
        } else {
            this._usb.Monitor.stopWatching(this._onDriveEvent);
            this._usb = undefined;
        }
    }
}


module.exports = { Router };