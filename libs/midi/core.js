const midi = require('midi');


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


class Device {
    constructor() {
        this._reset();
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
        throw "Not implemented!";
    }

    _reset() {
        this._name = "";
        this._port = -1;
        this._nickname = undefined;
    }

    open(name, portNumber, nickname) {
        for (let i = 0; i < this._device.getPortCount(); i++) {
            let port = PortRecord.parse(this._device.getPortName(i));
            if (port.name === name && port.port === portNumber) {
                this._device.openPort(i);
                // TODO: Verify the .openPort() call was successful before setting names.
                this._name = name;
                this._port = portNumber;
                if (nickname) {
                    this._nickname = nickname;
                }
                return this;
            }
        }
        return false;
    }

    openPort(number, nickname) {
        this._device.openPort(number);
        // TODO: Verify the .openPort() call was successful before setting names.
        this._name = this._device.getPortName(number);
        this._port = number;
        if (nickname) {
            this._nickname = nickname;
        }
        return this;
    }

    batchOpen(... portRecords) {
        let result = [];
        let firstPort = portRecords.shift();
        if (firstPort) {
            result.push(this.open(firstPort.name, firstPort.port, firstPort.nickname));
        }
        let class_ = this.constructor;
        if (portRecords.length === 1) {
            result.push(new class_().open(portRecords[0].name, portRecords[0].port, portRecords[0].nickname));
        } else {
            let map = this.portMap;
            for (let port of portRecords) {
                if (map[port.name] && port.port in map[port.name]) {
                    let additional = new class_();
                    additional.openPort(map[port.name][port.port], port.nickname);
                    result.push(additional);
                }
            }
        }
        return result;
    }

    close(cleanup = true) {
        if (cleanup) {
            this._cleanup();
            this._reset();
        }
        if (this._device) {
            this._device.closePort();
        }
    }

    get isOpen() {
        // TODO: This method requires a fork to node-midi... look into alternative methods of checking port status, OR bring the fork in as a local dependency.
        return this._device.isPortOpen();
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

    // get device() {
    //     // TODO: Should this be exposed?
    //     return this._device;
    // }

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

    _create() {
        return new midi.input();
    }

    _cleanup() {
        this.unbindAll();
    }

    bind(onMessage) {
        this._device.on('message', onMessage);
    }

    unbind(onMessage) {
        this._device.removeListener('message', onMessage);
    }

    unbindAll() {
        this._device.removeAllListeners('message');
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
        // TODO: validate message? Use node-easymidi helper class for messages.
        this._device.sendMessage(message);
    }
}

class Core {
    // TODO: Make into singleton using module.exports = new Core();
    // TODO: Core class can handle the switch-off between node-midi and node-midi-jack if added.
    // TODO: Core needs to maintain the pool of MIDI I/O objects. Close and re-use I/O as needed. Too many instantiations [new midi.input();] can cause a crash/memory leak (ALSA will crash.)

    constructor() {
        this._inputs = {"active":{}, "recycle":[]};
        this._outputs = {"active":{}, "recycle":[]};
    }

    // TODO: rename this method / it's parameters.
    _recycleConnections(recycleables, ... portRecords) {
        // TODO: recycleables.shift(), open(portRecord.name, portRecord.port);
        // TODO: return opened connections ... Discard failed connection objects?
    }

    // noinspection JSMethodCanBeStatic
    _open(type, registry, ... ports) {
        let device = new type();
        // TODO: check pool of recycleables in registry, re-use if there.
        // TODO: Check to see if any of the requested ports are already active.
        let _opened = device.batchOpen(... ports);
        for (let opened of _opened) {
            registry.active[opened.nickname] = opened;
        }
        return _opened;
    }

    openInputs(... ports) {
        return this._open(Input, this._inputs, ... ports);
    }

    openOutputs(... ports) {
        return this._open(Output, this._outputs, ... ports);
    }
}

// class Monitor {
//
// }


module.exports = new Core();