const midi = require('midi');

/**
 * onMessage callbacks handle incoming MIDI messages with regards to the mapping.
 *
 * @callback deviceMessageHandler
 * @param {Device} device - The MIDI device object sending the message.
 * @param {Message} message - MIDI message received from the input.
 */


const PortRecord = {
    create: (name, port) => {
        return {name, "port": parseInt(port), "nickname": undefined};
    },
    parse: (deviceName) => {
        if (!deviceName) {
            // TODO: error
            return;
        }
        let match = /^([\w\W]+)\s\d+\:(\d+)$/g.exec(deviceName);
        return {name: match[1], port: parseInt(match[2]), nickname: undefined};
    }
};

// TODO: Convert into class with getters that access the bytes directly
const Message = {
    in: {
        types: {
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
        },
        parse: (bytes, deltaTime) => {
            let typeByte, msg = {};
            if (bytes[0] < 0xF0) {
                // basic
                typeByte = bytes[0] >> 4;
                msg.channel = bytes[0] & 0xF;
            } else {
                // extended
                typeByte = bytes[0];
            }
            switch (typeByte) {
                // basic
                case 0x08:  // noteoff
                case 0x09:  // noteon
                    msg.note = bytes[1];
                    msg.velocity = bytes[2];
                    break;
                case 0x0A:  // poly aftertouch
                    msg.note = bytes[1];
                    msg.pressure = bytes[2];
                    break;
                case 0x0B:  // cc
                    msg.controller = bytes[1];
                    msg.value = bytes[2];
                    break;
                case 0x0C:  // program
                    msg.number = bytes[1];
                    break;
                case 0x0D:  // channel aftertouch
                    msg.pressure = bytes[1];
                    break;
                case 0x0E:  // pitch
                // extended
                case 0xF2:  // position
                    msg.value = bytes[1] + (bytes[2] * 128);
                    break;
                case 0xF0:  // sysex
                    msg.bytes = bytes;
                    break;
                case 0xF1:  // mtc
                    msg.type = (bytes[1] >> 4) & 0x07;
                    msg.value = bytes[1] & 0x0F;
                    break;
            }
            return {
                type: Message.in.types[typeByte] || 'unknown',
                msg: msg,
                bytes: bytes,
                deltaTime: deltaTime
            };
        }
    },
    out: {
        types: {
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
        },
        parse: (type, args) => {
            let typeByte, bytes = [];
            if (Message.out.types.basic[type]) {
                args.channel = args.channel || 0;
                typeByte = Message.out.types.basic[type];
                bytes.push((typeByte << 4) + args.channel);
            } else if (Message.out.types.extended[type]) {
                typeByte = Message.out.types.extended[type];
                bytes.push(typeByte);
            } else {
                throw `Unknown midi message type: ${type}`;
            }
            switch (typeByte) {
                // basic
                case 0x08:  // noteoff
                case 0x09:  // noteon
                    bytes.push(args.note, args.velocity);
                    break;
                case 0x0A:  // poly aftertouch
                    bytes.push(args.note, args.pressure);
                    break;
                case 0x0B:  // cc
                    bytes.push(args.controller, args.value);
                    break;
                case 0x0C:  // program
                    bytes.push(args.number);
                    break;
                case 0x0D:  // channel aftertouch
                    bytes.push(args.pressure);
                    break;
                case 0x0E:  // pitch
                // extended
                case 0xF2:  // position
                    bytes.push(args.value & 0x7F);  // lsb
                    bytes.push((args.value & 0x3F80) >> 7); // msb
                    break;
                case 0xF0:  // sysex
                    if (args.length < 4 || args[0] != 0xF0 || args[args.length - 1] != 0xF7) {
                        throw "Sysex args must be an array starting with 0xF0 and ending with 0xF7";
                    }
                    bytes.push(... args.slice(1));
                    break;
                case 0xF3:  // select
                    bytes.push(args.song);
                    break;
            }
            return bytes;
        }
    }
};


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
        if (this._port === -1) {    // V
            // TODO: print warning?
            return;
        }
        if (this.isOpen) {
            this.close();
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
}

class Input extends Device {
    // TODO: Subclass Input for ClockMasterInput?
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
        this._device.on('message', (deltaTime, msg) => {
            onMessage(this, Message.in.parse(msg, deltaTime));
        });
    }

    unbind(onMessage) {
        this._device.removeListener('message', onMessage);
    }

    unbindAll() {
        this._device.removeAllListeners('message');
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
        if (this.isOpen) {
            this._device.sendMessage(message);
        }
    }
}

class Core {
    // TODO: Make into singleton using module.exports = new Core();
    // TODO: Core class can handle the switch-off between node-midi and node-midi-jack if added.
    // TODO: Core needs to maintain the pool of MIDI I/O objects. Close and re-use I/O as needed. Too many instantiations [new midi.input();] can cause a crash/memory leak (ALSA will crash.)

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
            this._usb = require('../usb');
            this._usb.Monitor.watchDevices((event, device) => {
                let processor = event === this._usb.Event.ADD ? add : remove;
                console.log(`Hotplug : ${event} - ${device.name}`);
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
    _open(type, registry, ... ports) {
        let opened = [];
        for (let port of ports) {
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
            for (let input of inputs) {
                input.listenSysex = listenFlags.sysex;
                input.listenClock = listenFlags.clock;
                input.listenActiveSense = listenFlags.activeSense;
            }
        }
        return inputs;
    }

    openOutputs(... ports) {
        return this._open(Output, this._outputs, ... ports);
    }

    get deviceMap() {
        let input = new Input();
        let map = input.deviceMap;
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

// class Monitor {
//
// }


module.exports = new Core();