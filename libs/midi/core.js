const fs = require('fs');
const logger = require('log4js').getLogger();
const midi = require('midi');
const { MessageTypeFilter } = require('./filter');
const { StringFormat } = require('../tools');
const usb = require('../usb');

/**
 * onMessage callbacks handle incoming MIDI messages with regards to the mapping.
 *
 * @callback deviceMessageHandler
 * @param {Device} device - The MIDI device object sending the message.
 * @param {Message} message - MIDI message received from the input.
 */


class PortRecord {
    static parse(deviceName) {
        if (!deviceName) {
            return;
        }
        let match = /^([\w\W]+)\s\d+\:(\d+)$/g.exec(deviceName);
        return new PortRecord(match[1], match[2]);
    }

    constructor(name, port, nickname) {
        // TODO: should we validate name/port?
        this._name = name;
        this._port = parseInt(port);
        this._nickname = (!nickname) ? `${StringFormat.pascalCase(name)}___${port}` : nickname;
    }

    get name() {
        return this._name;
    }

    get port() {
        return this._port;
    }

    get nickname() {
        return this._nickname;
    }
}

const byteToStringTypeMap = {
    // basic
    0x08: 'noteoff',
    0x09: 'noteon',
    0x0A: 'poly aftertouch',
    0x0B: 'cc',
    0x0C: 'program',
    0x0D: 'channel aftertouch',
    0x0E: 'pitch',
    // extended
    0xF0: 'sysex',
    0xF1: 'mtc',
    0xF2: 'position',
    0xF3: 'select',
    0xF6: 'tune',
    0xF7: 'sysex end',
    0xF8: 'clock',
    0xFA: 'start',
    0xFB: 'continue',
    0xFC: 'stop',
    0xFF: 'reset'
};

const stringToByteTypeMap = {
    basic: {
        'noteoff': 0x08,
        'noteon': 0x09,
        'poly aftertouch': 0x0A,
        'cc': 0x0B,
        'program': 0x0C,
        'channel aftertouch': 0x0D,
        'pitch': 0x0E
    },
    extended: {
        'sysex': 0xF0,
        'mtc': 0xF1,
        'position': 0xF2,
        'select': 0xF3,
        'tune': 0xF6,
        'sysex end': 0xF7,
        'clock': 0xF8,
        'start': 0xFA,
        'continue': 0xFB,
        'stop': 0xFC,
        'reset': 0xFF
    }
};

const SYSEX_START = 0xF0;
const SYSEX_END = 0xF7;

const noteStrings = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

class Message {
    static fromProperties(type, properties) {
        let message = new Message();
        message.typeString = type;
        for (let name in properties) {
            message[name] = properties[name];
        }
        return message;
    }

    static fromSysexFile(filePath) {
        let fileData = fs.readFileSync(filePath);
        let started = false;
        let result = [];
        let bytes;
        // Ignores non-sysex bytes.
        for (let byte of fileData) {
            if (!started) {
                if (byte === SYSEX_START) {
                    bytes = [byte];
                    started = true;
                }
            } else {
                bytes.push(byte);
                if (byte === SYSEX_END) {
                    result.push(new Message(bytes));
                    started = false;
                }
            }
        }
        return result;
    }

    static get bytetoStringTypeMap() {
        return byteToStringTypeMap;
    }

    static get stringToByteTypeMap() {
        return stringToByteTypeMap;
    }

    constructor(bytes = [0, 0, 0], additionalProperties = {}) {
        this._properties = [];
        this.bytes = bytes;
        this._lastType = undefined;
        this._updateProperties(this.type);
        this._additionalProperties = {};
        for (let key in additionalProperties) {
            this.addAdditionalProperty(key, additionalProperties[key]);
        }
    }

    copy() {
        return new Message([... this._bytes], Object.assign({}, this._additionalProperties));
    }

    _updateProperties(type) {
        if (this._lastType === type) {
            return;
        }
        this._lastType = type;
        let get = (index) => {
            return () => {
                return this._bytes[index];
            }
        };
        let set = (index) => {
            return (value) => {
                this._bytes[index] = value;
            }
        };
        let addProp = (name, getter, setter) => {
            Object.defineProperty(this, name, {
                get: getter,
                set: setter,
                enumerable: true,
                configurable: true
            });
            this._properties.push(name);
        };
        // Remove any existing properties
        for (let name of this._properties) {
            delete this[name];
        }
        // Add relevant properties
        switch (type) {
            // basic
            case 0x08:  // noteoff
            case 0x09:  // noteon
                addProp('note', get(1), set(1));
                addProp('velocity', get(2), set(2));
                addProp('octave', () => {
                    return Math.trunc((this.note / 12) - 1);
                }, undefined);
                addProp('noteString', () => {
                    return `${noteStrings[this.note % 12]}${this.octave}`;
                }, undefined);
                break;
            case 0x0A:  // poly aftertouch
                addProp('note', get(1), set(1));
                addProp('pressure', get(2), set(2));
                addProp('octave', () => {
                    return Math.trunc((this.note / 12) - 1);
                }, undefined);
                addProp('noteString', () => {
                    return `${noteStrings[this.note % 12]}${this.octave}`;
                }, undefined);
                break;
            case 0x0B:  // cc
                addProp('controller', get(1), set(1));
                addProp('value', get(2), set(2));
                break;
            case 0x0C:  // program
                addProp('number', get(1), set(1));
                break;
            case 0x0D:  // channel aftertouch
                addProp('pressure', get(1), set(1));
                break;
            case 0x0E:  // pitch
            // extended
            case 0xF2:  // position
                addProp('value', () => {
                    return this._bytes[1] + (this._bytes[2] * 128);
                }, (value) => {
                    this._bytes[1] = value & 0x7F;              // lsb
                    this._bytes[2] = ((value & 0x3F80) >> 7);   // msb
                });
                break;
            case 0xF1:  // mtc
                addProp('mtcType', () => {
                    return (this._bytes[1] >> 4) & 0x07;
                }, (value) => {
                    // TODO: Verify this!
                    this._bytes[1] = (value << 4) + this.value;
                });
                addProp('value', () => {
                    return this._bytes[1] & 0x0F;
                }, (value) => {
                    this._bytes[1] = (this.mtcType << 4) + value;
                });
                break;
            case 0xF3:  // select
                addProp('song', get(1), set(1));
                break;
        }
    }

    addAdditionalProperty(key, value) {
        // TODO: Should these additionalProperties be added with Object.defineProperty?
        this._additionalProperties[key] = value;
    }

    removeAdditionalProperty(key) {
        if (this._additionalProperties[key]) {
            delete this._additionalProperties[key];
        }
    }

    get bytes() {
        return [... this._bytes];
    }

    set bytes(bytes) {
        // TODO: Validate bytes contents?
        if (bytes[0] === SYSEX_START) {
            if (bytes.length < 4 || bytes[bytes.length - 1] !== SYSEX_END) {
                throw "Sysex args must be an array starting with 0xF0 and ending with 0xF7";
            }
            this._bytes = [... bytes];
            this._updateProperties(SYSEX_START);
        } else {
            this._bytes = [bytes[0], bytes[1], bytes[2]];
            this._updateProperties(this.type);
        }
    }

    get channel() {
        return (this.isTypeBasic)
            ? this._bytes[0] & 0xF
            : -1;
    }

    set channel(channel) {
        if (this.isTypeBasic) {
            this._bytes[0] = (this.type << 4) + channel;
        }
    }

    get type() {
        return (this.isTypeBasic)
            ? this._bytes[0] >> 4
            : this._bytes[0];
    }

    set type(type) {
        this._bytes[0] = (type < 0xF0)
            ? type >> 4
            : type;
        this._updateProperties(type);
    }

    get typeString() {
        return byteToStringTypeMap[this.type];
    }

    set typeString(typeString) {
        if (typeString in stringToByteTypeMap.basic) {
            this.type = stringToByteTypeMap.basic[typeString];
        } else if (typeString in stringToByteTypeMap.extended) {
            this.type = stringToByteTypeMap.extended[typeString];
        }
    }

    get isTypeBasic() {
        return this._bytes[0] < 0xF0;
    }

    get isTypeExtended() {
        return this._bytes[0] >= 0xF0;
    }

    get properties() {
        let props = {};
        for (let name of this._properties) {
            props[name] = this[name];
        }
        for (let name in this._additionalProperties) {
            props[name] = this._additionalProperties[name];
        }
        return props;
    }
}

class Device {
    constructor() {
        this._name = "";
        this._port = -1;
        this._nickname = undefined;
        this._device = this._create();
    }

    /**
     * Return the midi device object.
     */
    _create() {
        throw "Not implemented!";
    }

    /**
     * Code to be executed during cleanup performed on closing.
     * @private
     */
    _cleanup() {
        // TODO: make this optional for subclasses?
        throw "Not implemented!";
    }

    _onOpen() {
        // Optional override
    }

    _onClose() {
        // Optional override
    }

    open(name, portNumber, nickname) {
        if (this.isOpen) {
            // TODO: print warning?
            return this;
        }
        if (!this._device) {
            this._device = this._create();
        }
        this._name = name;
        this._port = portNumber;
        if (nickname) {
            this._nickname = nickname;
        }
        for (let i = 0; i < this._device.getPortCount(); i++) {
            let port = PortRecord.parse(this._device.getPortName(i));
            if (port.name === name && port.port === portNumber) {
                this._device.openPort(i);
                this._onOpen();
                break;
            }
        }
        return this;
    }

    openPort(number, nickname) {
        if (this.isOpen) {
            // TODO: print warning?
            return this;
        }
        if (!this._device) {
            this._device = this._create();
        }
        this._device.openPort(number);
        let record = PortRecord.parse(this._device.getPortName(number));
        this._name = record.name;
        this._port = record.port;
        if (nickname) {
            this._nickname = nickname;
        }
        this._onOpen();
        return this;
    }

    close(cleanup = true) {
        if (this._device) {
            if (cleanup) {
                this._cleanup();
            }
            this._device.closePort();
            this._onClose();
            this.release();
        }
    }

    release() {
        if (this._device) {
            this._device.release();
            delete this._device;
        }
    }

    reopen() {
        if (this._port === -1) {
            // TODO: print warning?
            return this;
        }
        if (this.isOpen) {
            this.close(false);
        }
        this.open(this._name, this._port, this._nickname);
    }

    get isOpen() {
        return this._device && this._device.isPortOpen();
    }

    get name() {
        return this._name;
    }

    get portNumber() {
        return this._port;
    }

    get nickname() {
        return (this._nickname) ? this._nickname : this._name;
    }

    // TODO: Move this to a static method
    get portMap() {
        let result = {};
        if (this._device.getPortCount()) {
            for (let i = 0; i < this._device.getPortCount(); i++) {
                let port = PortRecord.parse(this._device.getPortName(i));
                if (!result[port.name]) {
                    result[port.name] = [];
                }
                result[port.name][port.port] = i;
            }
        }
        return result;
    }

    // TODO: Move this to a static method, combine with get.portMap
    portMapByName(... names) {
        // todo: This is hacked together... Rewrite later to skip unnecessary port indexing.
        if (!names.length) {
            return {};
        }
        let map = this.portMap;
        let result = {};
        for (let name of names) {
            if (map[name]) {
                result[name] = map[name];
            }
        }
        return result;
    }
}

class Input extends Device {
    constructor() {
        super();
        this._listenSysex = false;
        this._listenClock = false;
        this._listenActiveSense = false;
    }

    _create() {
        return new midi.input();
    }

    _onOpen() {
        if (this._bindings) {
            for (let callback of this._bindings) {
                this._device.on('message', callback);
            }
            delete this._bindings;
        }
        this._setupListenTypes(false);
    }

    _onClose() {
        let bindings = this._device.listeners('message');
        if (!!bindings.length) {
            this._bindings = bindings;
        }
    }

    _cleanup() {
        this.unbindAll();
    }

    bind(onMessage) {
        if (this._device) {
            this._device.on('message', (deltaTime, msg) => {
                onMessage(this, new Message(msg, { deltaTime }));
            });
        }
    }

    unbind(onMessage) {
        if (this._device) {
            this._device.removeListener('message', onMessage);
        }
    }

    unbindAll() {
        if (this._device) {
            this._device.removeAllListeners('message');
        }
    }

    get listenFlags() {
        return {
            sysex: this._listenSysex,
            clock: this._listenClock,
            activeSense: this._listenActiveSense
        }
    }

    get listenSysex() {
        return this._listenSysex;
    }

    set listenSysex(listen) {
        if (this._listenSysex === listen || typeof listen !== 'boolean') {
            return;
        }
        this._listenSysex = listen;
        this._setupListenTypes(true);
    }

    get listenClock() {
        return this._listenClock;
    }

    set listenClock(listen) {
        if (this._listenClock === listen || typeof listen !== 'boolean') {
            return;
        }
        this._listenClock = listen;
        this._setupListenTypes(true);
    }

    get listenActiveSense() {
        return this._listenActiveSense;
    }

    set listenActiveSense(listen) {
        if (this._listenActiveSense === listen || typeof listen !== 'boolean') {
            return;
        }
        this._listenActiveSense = listen;
        this._setupListenTypes(true);
    }

    _setupListenTypes(changed) {
        if (this.isOpen && (changed || (this._listenSysex || this._listenClock || this._listenActiveSense))) {
            this._device.ignoreTypes(!this._listenSysex, !this._listenClock, !this._listenActiveSense);
        }
    }
}

class Output extends Device {

    _create() {
        return new midi.output();
    }

    _cleanup() {
        // TODO
    }

    sendMessage(message) {
        logger.debug(`sendMessage::${this.name}||isOpen::${this.isOpen}`);
        if (this.isOpen) {
            this._device.sendMessage(message);
        }
    }
}

class Core {
    // TODO: Core class can handle the switch-off between node-midi and node-midi-jack if added.
    constructor() {
        this._inputs = {};
        this._outputs = {};
        this._usbDetect = undefined;
    }

    get hotplug() {
        return this._usbDetect !== undefined;
    }

    set hotplug(enabled) {
        // TODO: Should we restrict hotplugging from being enabled again after being disabled once?
        //  https://github.com/MadLittleMods/node-usb-detection/issues/53
        if (this.hotplug === enabled || typeof enabled !== 'boolean') {
            return;
        }
        if (enabled) {
            let add = (io) => {
                io.reopen();
            };
            let remove = (io) => {
                io.close(false);
            };
            // TODO: Move this import over to the `usb` object imported at very top.
            this._usb = require('../usb');
            this._usb.Monitor.watchDevices((event, device) => {
                let processor = event === this._usb.Event.ADD ? add : remove;
                logger.debug(`Hotplug : ${event.toString()} - ${device.name}`);
                let ins = this._inputs[device.name];
                let outs = this._outputs[device.name];
                for (let group of [ins, outs]) {
                    if (group) {
                        for (let io of group) {
                            processor(io);
                        }
                    }
                }
            });
            this._usb.Monitor.startMonitoring();
        } else {
            this._usb.Monitor.stopMonitoring();
            delete this._usb;
        }
    }

    // noinspection JSMethodCanBeStatic
    _setListenFlags(listenFlags, ... inputs) {
        for (let input of inputs) {
            input.listenSysex = listenFlags.sysex;
            input.listenClock = listenFlags.clock;
            input.listenActiveSense = listenFlags.activeSense;
        }
    }

    // noinspection JSMethodCanBeStatic
    _open(type, registry, ... ports) {
        let opened = [];
        for (let port of ports) {
            if (registry[port.name] && registry[port.name][port.port]) {
                opened.push(registry[port.name][port.port]);
                continue;
            }
            let opening = new type().open(port.name, port.port, port.nickname);
            opened.push(opening);
            if (!registry[port.name]) {
                registry[port.name] = [];
            }
            registry[port.name][port.port] = opening;
        }
        return opened;
    }

    openInputs(listenFlags, ... ports) {
        let inputs = this._open(Input, this._inputs, ... ports);
        if (listenFlags) {
            this._setListenFlags(listenFlags, ... inputs);
        }
        return inputs;
    }

    openOutputs(... ports) {
        return this._open(Output, this._outputs, ... ports);
    }

    _openAll(type, registry) {
        let map = this.deviceMap;
        let result = [];
        for (let name in map) {
            if (registry[name]) {
                result.push(... registry[name]);
            } else {
                for (let devicePort in map[name]) {
                    let portRecord = new PortRecord(name, devicePort);
                    let opened = this._open(type, registry, portRecord);
                    result.push(... opened);
                }
            }
        }
        return result;
    }

    openAllInputs(listenFlags) {
        let inputs = this._openAll(Input, this._inputs);
        if (listenFlags) {
            this._setListenFlags(listenFlags, ... inputs);
        }
        return inputs;
    }

    openAllOutputs() {
        return this._openAll(Output, this._outputs);
    }

    // noinspection JSMethodCanBeStatic
    deviceMapByName(... names) {
        // TODO: Combine with deviceMap getter, make static if possible
        let input = new Input();
        let map = input.portMapByName(... names);
        input.release();
        return map;
    }

    // noinspection JSMethodCanBeStatic
    get deviceMap() {
        // TODO: Make this static if possible
        let input = new Input();
        let map = input.portMap;
        input.release();
        return map;
    }

    onExit() {
        this.hotplug = false;
        for (let registry of [this._inputs, this._outputs]) {
            for (let name in registry) {
                for (let port in registry[name]) {
                    registry[name][port].close();
                    delete registry[name][port];
                }
            }
        }
    }
}

const MIDI_CORE = new Core();

class Monitor {
    constructor({ inputs = [], hotplug = true, messageTypes = [0x0B], handler }) {
        if (Array.isArray(messageTypes) && !!messageTypes.length) {
            this._filter = new MessageTypeFilter({ whitelist: messageTypes });
        }
        if (!handler) {
            handler = (device, message) => {
                logger.debug(`Device: ${device.name} | Message: ${message.typeString}, ${message.bytes}`);
            }
        }
        this.handler = handler;
        this._inputs = {};
        if (!Array.isArray(inputs) || !inputs.length) {
            inputs = MIDI_CORE.openAllInputs();
        }
        if (inputs && !!inputs.length) {
            for (let input of inputs) {
                this._bind(input);
            }
        }
        MIDI_CORE.hotplug = true;
        this.hotplug = hotplug;
    }

    _isWatched(name) {
        return !!this._inputs[name];
    }

    _handleMessage(device, message) {
        if (this._filter && !this._filter.process(message)) {
            return;
        }
        this._handler(device, message);
    }

    _handleUsb(event, usbDevice) {
        if (!this._inputs[usbDevice.name]) {
            // TODO: Move this into a Core.openAllByName(... names)? Probably yes
            let map = MIDI_CORE.deviceMapByName(usbDevice.name);
            for (let devicePort of map[usbDevice.name]) {
                let portRecord = new PortRecord(usbDevice.name, devicePort);
                let input = MIDI_CORE.openInputs(null, portRecord);
                this._bind(input);
            }
        }
    }

    _bind(input) {
        if (!this._inputs[input.name]) {
            this._inputs[input.name] = [];
        }
        if (!this._inputs[input.name][input.port]) {
            input.bind(this._handleMessage);
            this._inputs[input.name][input.port] = input;
        }
        // TODO: Should we check .isOpen and open if false?
    }

    get handler() {
        return this._handler;
    }

    set handler(handler) {
        if (typeof handler !== 'function') {
            throw "Monitor handler must be a function!";
        }
        this._handler = handler;
    }

    get hotplug() {
        return this._hotplug;
    }

    set hotplug(hotplug) {
        if (hotplug === this._hotplug) {
            return;
        }
        if (hotplug) {
            usb.Monitor.watchDevices(this._handleUsb);
        } else if (this._hotplug) {
            usb.Monitor.stopWatching(this._handleUsb);
        }
        this._hotplug = hotplug;
    }

    close() {
        this.hotplug = false;
        for (let name in this._inputs) {
            for (let devicePort in name) {
                let input = this._inputs[name][devicePort];
                input.unbind(this._handleMessage);
                delete this._inputs[name][devicePort];
            }
            delete this._inputs[name];
        }
    }
}


module.exports = { Core: MIDI_CORE, Message: Message, Monitor: Monitor, PortRecord: PortRecord };