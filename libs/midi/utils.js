const { Core, Message, PortRecord, PortIndex } = require('./core');
const logger = require('log4js').getLogger();
const { MessageTypeFilter } = require('./filter');
const usb = require('../usb');


class Monitor {
    constructor({ inputs = [], hotplug = true, messageTypes = [0x0B], handler } = {}) {
        if (Array.isArray(messageTypes) && !!messageTypes.length) {
            this._filter = new MessageTypeFilter({ whitelist: messageTypes });
        }
        if (!handler) {
            handler = (device, message) => {
                logger.debug(`Device: ${device.name} | Message: ${message.typeString}, ${message.bytes}`);
            }
        }
        this._setupHandlers();
        this.handler = handler;
        this._inputs = {};
        if (!Array.isArray(inputs) || !inputs.length) {
            inputs = Core.openAllInputs();
        }
        if (inputs && !!inputs.length) {
            for (let input of inputs) {
                this._bind(input);
            }
        }
        Core.hotplug = true;
        this.hotplug = hotplug;
    }

    _setupHandlers() {
        this._handleMessage = (device, message) => {
            if (this._filter && !this._filter.process(message)) {
                return;
            }
            this._handler(device, message);
        };
        this._handleUsb = (event, usbDevice) => {
            if (!this._inputs[usbDevice.name]) {
                // TODO: Add logging to hotplug events
                // TODO: Move this into a Core.openAllByName(... names)? Probably yes
                let map = Core.deviceMapByName(usbDevice.name);
                for (let devicePort in map[usbDevice.name]) {
                    let portRecord = new PortRecord(usbDevice.name, devicePort);
                    let input = Core.openInputs(null, portRecord);
                    this._bind(input[0]);
                }
            }
        }
    }

    _isWatched(name) {
        return !!this._inputs[name];
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

    onExit() {
        this.hotplug = false;
        Core.onExit();
    }
}

class SysexLoader {
    constructor(path, output) {
        if (!path) {
            throw "Invalid value for sysex file path";
        } else if (!output) {
            throw "Invalid value for sysex file output";
        }
        this._message = Message.fromSysexFile(path);
        if (!PortIndex.count && global.configPath) {
            PortIndex.populateFromConfig(global.configPath);
        }
        let _record = PortIndex.get(output) || PortRecord.parse(output);
        this._output = Core.openOutputs(_record)[0];
    }

    get message() {
        return this._message;
    }

    get output() {
        return this._output;
    }

    send() {
        try {
            this._output.sendMessage(this._message.bytes);
        } catch (err) {
            logger.error(`Error occurred during sysex file send.\n${err}`);
        }
    }
}

module.exports = { Monitor, SysexLoader };