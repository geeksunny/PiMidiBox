const EventEmitter = require('eventemitter3');
const logger = require('log4js').getLogger();
const tools = require('../tools');
const { Message } = require('./core');

/**
 * @callback adjustHandler
 * @param {Message} message - The MIDI message that triggered this handler.
 */

/**
 * Defines a dictionary created by the {Filter} class for use in configuring Filter using {Adjuster}.
 * @typedef {Object<string, adjustHandler>} AdjustHandlers
 */

/**
 * Callback to handle the value parsed by an {Adjuster}.
 *
 * @callback adjusterValueHandler
 * @param {Object<string, number>} value - The value parsed to match the {Adjuster}'s `valueMap`.
 */

class Adjuster extends EventEmitter {
    /**
     * @param {Object} opts - An object defining the properties to build this Adjuster with.
     * @param {string} opts.name - The name of this adjuster, for configuration purposes.
     * @param {string} opts.description - A description of what this adjuster accomplishes.
     * @param {adjusterValueHandler} opts.handler - Adjuster callback that takes the message's value.
     * @param {boolean} [opts.potPickup=true] - Enable pot-pickup mode when adjusting values.
     * @param {Object<string, number|boolean>} opts.triggerMap - An object defining message properties used
     *      to trigger this Adjuster. Define property names as the keys.
     *      * Use a {number} to define a required numerical value.
     *      * Use a {boolean} to define a user-configurable value. Properties set to `true` are required
     *          and `false` are optional.
     * @param {string|number} opts.type - The message type required to trigger this Adjuster.
     * @param {string[]} opts.userMapping - An array of strings defining the potential mapping properties
     *      that are user configurable.
     * @param {string} [opts.valueKey] - An optional string defining the message property to be the
     *      value passed into `opts.handler`.
     */
    constructor({ name, description, handler, potPickup = true, triggerMap, type, userMapping, valueKey }) {
        super();
        // TODO: Refactor for potential of multiple type/property+handler pairings per adjuster
        this.handler = handler;
        this.name = name;
        this.description = description;
        this.type = type;
        this.triggerMap = triggerMap;
        this.potPickup = potPickup;
        this.userMapping = userMapping;
        this.valueKey = valueKey;
        this._value = 0;
    }

    process(message) {
        if (this._handler && this._userMap) {
            for (let { 0: property, 1: value } in Object.entries(this._userMap)) {
                if (message[property] !== value) {
                    return false;
                }
            }
            if (this._potPickup) {
                let value = message[this._valueKey];
                if (value !== undefined) {
                    if (Math.abs(this._value - value) <= 1) {
                        this._value = value;
                        this._handler(value);
                    }
                }
            } else {
                this._handler(message[this._valueKey]);
            }
            return true;
        }
        return false;
    }

    get description() {
        return this._description;
    }

    set description(description) {
        if (description) {
            this._description = description;
        }
    }

    get handler() {
        return this._handler;
    }

    set handler(adjustHandler) {
        if (typeof adjustHandler !== 'function') {
            throw new TypeError('Handler must be a callable function!');
        }
        this._handler = adjustHandler;
    }

    get name() {
        return this._name;
    }

    set name(name) {
        if (name) {
            this._name = name;
        }
    }

    get potPickup() {
        return this._potPickup;
    }

    set potPickup(enabled) {
        if (typeof enabled !== 'boolean') {
            throw new TypeError('Boolean value required.');
        }
        this._potPickup = enabled;
    }

    get triggerMap() {
        return this._triggerMap;
    }

    set triggerMap(map) {
        if (!map || !Object.keys(map).length) {
            throw new TypeError('Trigger map must be an object with at least one key and value.');
        }
        this._triggerMap = Object.assign({ channel: true }, map);
    }

    get type() {
        return this._type;
    }

    set type(type) {
        if (typeof type === 'string') {
            type = Message.typeFromString(type);
        }
        if (Message.isTypeValid(type)) {
            this._type = type;
        } else {
            throw "Invalid message type provided!";
        }
    }

    get userMapping() {
        return this._userMap || {};
    }

    set userMapping(map) {
        if (map) {
            let userMap = {};
            for (let { 0: name, 1: value } of Object.entries(this._triggerMap)) {
                if (map[name] === undefined) {
                    if (value !== false) {
                        throw `Adjuster mapping missing required field '${name}'!`;
                    }
                } else {
                    if (typeof value === 'number') {
                        userMap[name] = value;
                    } else {
                        userMap[name] = map[name];
                    }
                }
            }
            this._userMap = userMap;
            this.emit('mapped', this._userMap);
        }
    }

    get value() {
        return this._value;
    }

    set value(value) {
        if (typeof value === 'number') {
            this._value = value;
        }
    }

    get valueKey() {
        return this._valueKey;
    }

    set valueKey(key) {
        if (key) {
            this._valueKey = key;
        }
    }
}

/**
 * Interface for filters processing received MIDI messages.
 *
 * @interface
 */
class Filter {
    constructor({ adjusters } = {}) {
        this._paused = false;
        this._mappedAdjusters = {};
        this._availableAdjusters = this._prepareAdjusters(adjusters);
    }

    // noinspection JSMethodCanBeStatic
    /**
     * To add adjustment capability, override this method and return an array of {Adjuster} objects.
     * @returns {Adjuster[]}
     * @private
     */
    _adjusters() {
        return [];
    }

    /**
     * Prepare the available adjusters for this Filter.
     * @param {Adjuster[]} customAdjusters - An optional array of custom-defined adjusters to be added to this filter.
     * @returns {Adjuster[]}
     * @private
     */
    _prepareAdjusters(customAdjusters) {
        let adjusters = [
            new Adjuster({
                name: 'toggle',
                description: 'Toggle the pause-state on this filter.',
                type: 0x0B,
                potPickup: false,
                triggerMap: {
                    controller: true,
                    value: false
                },
                handler: () => {
                    this.toggle();
                }
            })
        ];
        let _adjusters = tools.combine(adjusters, this._adjusters());
        if (Array.isArray(customAdjusters)) {
            // TODO: Should we replace adjusters that have identical names? Probably.
            for (let adjuster of customAdjusters) {
                if (adjuster instanceof Adjuster) {
                    _adjusters.push(adjuster);
                }
            }
        }
        for (let adjuster of _adjusters) {
            let mappingHandler = (mapping) => {
                if (Object.keys(mapping).length) {
                    if (!this._mappedAdjusters[adjuster.type]) {
                        this._mappedAdjusters[adjuster.type] = {};
                    }
                    this._mappedAdjusters[adjuster.type][adjuster.name] = adjuster;
                } else {
                    if (this._mappedAdjusters[adjuster.type]) {
                        delete this._mappedAdjusters[adjuster.type][adjuster.name];
                        if (!Object.keys(this._mappedAdjusters[adjuster.type]).length) {
                            delete this._mappedAdjusters[adjuster.type];
                        }
                    }
                }
            };
            mappingHandler(adjuster.userMapping);
            adjuster.on('mapped', mappingHandler);
        }
        return _adjusters;
    }

    /**
     * Get all available Adjusters for use with this Filter.
     * @returns {Adjuster[]}
     */
    get adjusters() {
        return this._availableAdjusters;
    }

    /**
     * Configure one or more Adjuster mapping.
     * @param {Object<string, Object<string, number>>} adjusters
     */
    set adjusters(adjusters) {
        if (adjusters) {
            for (let adjuster of this._availableAdjusters) {
                if (adjusters[adjuster.name]) {
                    adjuster.userMapping = adjusters[adjuster.name];
                }
            }
        }
    }

    /**
     * Pause operation of this Filter.
     */
    pause() {
        if (!this._paused) {
            this._paused = true;
        }
    }

    /**
     * Resume operation of this Filter if paused.
     */
    unpause() {
        if (this._paused) {
            this._paused = false;
        }
    }

    /**
     * Toggle the paused-state of this Filter.
     */
    toggle() {
        this._paused = !this._paused;
    }

    /**
     * Get the current paused-state of this Filter.
     * @returns {boolean} True if this Filter is paused.
     */
    get paused() {
        return this._paused;
    }

    /**
     * Process a given MIDI message with this Filter's mapped Adjusters.
     * @param {Message} message
     * @returns {boolean} True if the message has been consumed by an Adjuster.
     *      The message chain for this message should be cancelled.
     * @private
     */
    _processAdjusters(message) {
        let type = message.type;
        if (this._mappedAdjusters[type]) {
            for (let { 0: name, 1: adjuster } of Object.entries(this._mappedAdjusters)) {
                let processed = adjuster.process(message);
                if (processed) {
                    logger.debug(`${this.constructor.name} process handled by mapped action '${name}'.`);
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Process a given MIDI message with this Filter.
     * @param {Message} message - The MIDI message to be processed.
     * @returns {boolean|Message|Message[]} - One of three types of values can be returned.
     *      * {boolean} true - The supplied Message was consumed by a Filter Adjuster. The message chain should be cancelled.
     *      * {boolean} false - The supplied Message should be cancelled. The message chain should continue.
     *      * {Message|Message[]} - Resulting processed message(s) to be passed along.
     */
    process(message) {
        if (this._paused) {
            return message;
        } else if (this._processAdjusters(message)) {
            return true;
        } else {
            return this._process(message);
        }
    }

    /**
     * Must override to implement the processing logic of this Filter class.
     * @param {Message} message - The MIDI message to be processed.
     * @returns {Message|Message[]|boolean} The message or array of messages to be passed down the line.
     * Return `false` to cancel the message from being passed along.
     */
    _process(message) {
        throw "Not implemented!";
    }

    /**
     * Must override and return an object representing the current settings of the filter.
     */
    _settings() {
        throw "Not implemented!";
    }

    /**
     * Returns an object representing the current settings of the filter.
     */
    get settings() {
        let settings = this._settings();
        if (!settings) {
            settings = {};
        }
        if (this._availableAdjusters.length) {
            settings.adjusters = {};
            for (let adjuster of this._availableAdjusters) {
                settings.adjusters[adjuster.name] = adjuster.userMapping;
            }
        }
        return settings;
    }
}

class ChannelFilter extends Filter {
    /**
     * TODO: desc
     * @param {Object} opts - An object containing one or more of the parameters listed below.
     *      If both a whitelist and blacklist is provided, the blacklist will be ignored.
     * @param {Number[]} [opts.whitelist] - An array of integers representing the only channels to be listened to.
     *      Messages on all other channels will be ignored.
     * @param {Number[]} [opts.blacklist] - An array of integers representing the only channels to be ignored.
     *      Messages on all other channels will be processed.
     * @param {Object} [opts.map] - an object mapping input channels to a different output channel.
     * @example <caption>Example of a channel mapping.</caption>
     *      // Input messages on channel 6 will be forwarded to 1, 7 to 2, 8 to 3.
     *      { "6": 1, "7": 2, "8": 3 }
     */
    constructor({ whitelist = [], blacklist = [], map = {} } = {}) {
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
            if (!tools.containsValue(this._whitelist, channel)) {
                logger.debug(`Channel is not whitelisted! ${channel}`);
                return false;
            }
        } else if (!!this._blacklist.length) {
            if (tools.containsValue(this._blacklist, channel)) {
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

    _settings() {
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

const Chord = tools.deepFreeze({
    "DISABLED": [],
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
});
const Chords = Object.freeze(Object.keys(Chord));
const ChordSteps = 127 / Chords.length;

class ChordFilter extends Filter {
    /**
     * // TODO: desc
     * @param {Object} opts - An object containing one or more of the parameters listed below.
     * @param {string} opts.chord - The chord to filter notes into.
     *      Valid Values:
     *          MAJOR2, MAJOR3, MAJOR3_LO, MAJOR7TH, MAJOR9TH, MAJOR11TH,
     *          MINOR2, MINOR3, MINOR3_LO, MINOR6TH, MINOR7TH, MINOR9TH, MINOR11TH,
     *          DIM, AUG, SUS2, SUS4, 7SUS2, 7SUS4, 6TH, 7TH, 9TH,
     *          POWER2, POWER3, OCTAVE2, OCTAVE3
     */
    constructor({ chord } = {}) {
        super();
        if (!chord) {
            throw "Value required for `chord`.";
        }
        this.chord = chord;
    }

    _adjusters() {
        return [
            new Adjuster({
                name: 'chord',
                description: 'Change the currently active chord.',
                type: 0x0B,
                potPickup: true,
                triggerMap: {
                    controller: true
                },
                valueKey: 'value',
                handler: (value) => {
                    this.chord = Math.trunc(value / ChordSteps);
                }
            })
        ];
    }

    set chord(chord) {
        if (typeof chord === "number") {
            chord = Chords[chord];
        }
        if (this._chord === chord) {
            return;
        } else if (!Chord[chord]) {
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

    _settings() {
        return {
            chord: this._chord
        };
    }
}

class MessageTypeFilter extends Filter {
    /**
     * // TODO: desc
     * @param {Object} opts - An object containing one or more of the parameters listed below.
     *      If both a whitelist and blacklist is provided, the blacklist will be ignored.
     * @param {Number[]|String[]} [whitelist] - An array of numbers or strings representing types of messages
     *      to allow through the filter.
     * @param {Number[]|String[]} [blacklist] - An array of numbers or strings representing types of messages
     *      to not allow through the filter.
     */
    constructor({ whitelist = [], blacklist = [], adjusters } = {}) {
        super({ adjusters });
        this.whitelist = whitelist;
        this.blacklist = blacklist;
    }

    static _makeList(... types) {
        let result = [];
        for (let type of types) {
            if (typeof type === 'string') {
                type = Message.typeFromString(type);
            }
            if (Message.isTypeValid(type)) {
                result.push(type);
            } // TODO: else, throw/warn?
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
        if (!!this._whitelist.length) {
            return (tools.containsValue(this._whitelist, message.type)) ? message : false;
        } else if (!!this._blacklist.length) {
            return (tools.containsValue(this._blacklist, message.type)) ? false : message;
        } else {
            return message;
        }
    }

    _settings() {
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
    constructor({ step } = {}) {
        super();
        this.step = step;
    }

    _adjusters() {
        return [
            new Adjuster({
                name: 'step',
                description: 'Change the currently active transpose step.',
                type: 0x0B,
                potPickup: true,
                triggerMap: {
                    controller: true
                },
                valueKey: 'value',
                handler: (value) => {
                    // Takes the value of `message.value` [0-127] and scales it across -10 / +10
                    this.step = Math.round(value / 6.35) - 10;
                }
            })
        ];
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

    _settings() {
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
     *      Must be an integer between 0-127. Default is 0.
     * @param {Number} [opts.max] - The maximum allowable velocity value.
     *      Must be an integer between 0-127 and equal to or higher than `opts.min`. Default is 127.
     * @param {string} [opts.mode] - The mode for this filter to operate in. Default is `clip`.
     *      * `clip` - Note velocity will be clipped to the value of `opts.min` or `opts.max` if the velocity is out of range.
     *      * `drop` - Drop the note if velocity does not fall within the range of `opts.min` and `opts.max`.
     *      * `scaled` - Note velocity will be scaled relative to the values of `opts.min` and `opts.max`.
     */
    constructor({ min = Velocity.min, max = Velocity.max, mode = 'clip' } = {}) {
        super();
        this.min = min;
        this.max = max;
        this.mode = mode;
    }

    _adjusters() {
        return [
            new Adjuster({
                name: 'min',
                description: 'Change the minimum velocity setting.',
                type: 0x0B,
                potPickup: true,
                triggerMap: {
                    controller: true
                },
                valueKey: 'value',
                handler: (value) => {
                    // TODO: Adjust the current value of this.min based on a value calculated with `value`.
                    throw "Stubbed!";
                }
            }),
            new Adjuster({
                name: 'max',
                description: 'Change the maximum velocity setting.',
                type: 0x0B,
                potPickup: true,
                triggerMap: {
                    controller: true
                },
                valueKey: 'value',
                handler: (value) => {
                    // TODO: Adjust the current value of this.max based on a value calculated with `value`.
                    throw "Stubbed!";
                }
            }),
            new Adjuster({
                name: 'mode',
                description: 'Change the currently active velocity mode.',
                type: 0x0B,
                potPickup: true,
                triggerMap: {
                    controller: true
                },
                valueKey: 'value',
                handler: (value) => {
                    // TODO: Adjust the current value of this.mode based on a value calculated with `value`.
                    throw "Stubbed!";
                }
            }),
        ];
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

    _settings() {
        return {
            min: this._min,
            max: this._max,
            mode: this._mode
        };
    }
}

module.exports = { Adjuster, Filter, ChannelFilter, ChordFilter, MessageTypeFilter, TransposeFilter, VelocityFilter };