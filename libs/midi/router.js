const midi = require('./core');


class Mapping {
    // TODO: Channel filters; inputs only listen for messages on given channels, outputs only receive messages sent for given channels
    // TODO: Features ala chord mode, etc are enabled / present here in the mapping class.
    constructor(inputs = [], outputs = []) {
        // TODO: Validate inputs/outputs?
        this._inputs = inputs;
        this._outputs = outputs;

        // TODO:::::This is test code for simple routing. move into methods, clean up, add support for features (to be processed on message receive)
        for (let input of inputs) {
            input.bind((deltaTime, message) => {
                console.log(`INPUT :: m: ${message} :: d: ${deltaTime}`);
                this.broadcast(message);
            });
        }
    }

    broadcast(message) {
        for (let i in this._outputs) {
            let output = this._outputs[i];
            output.sendMessage(message);
        }
    }
}

// TODO: Add listen-* options, reload-on-usb to Router class. Fix up .loadConfig()
class Router {
    constructor() {
        this.mappings = {};
    }

    // TODO: Clock master / relay
    // TODO: Add chord feature
    // TODO: Add velocity regulation feature
    // TODO: Add enable/disable feature for temporarily stopping all routing.

    loadConfig(path = './config.json') {
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
        let config = require(path);
        for (let mapName in config.mappings) {
            let mapCfg = config.mappings[mapName];
            let inputs = midi.openInputs(... getPortRecords(config.devices, mapCfg.inputs));
            let outputs = midi.openOutputs(... getPortRecords(config.devices, mapCfg.outputs));
            this.addMapping(mapName, inputs, outputs);
        }
    }

    addMapping(name, inputs = [], outputs = []) {
        // TODO: Should callbacks be passed in here? If not passed in, added
        this.mappings[name] = new Mapping(inputs, outputs);
    }

    // TODO: removeMapping(name)

    // TODO: Add note routing
    onMessage(message) {
        // TODO: Handle messages on input devices
    }

    routeNotes(mapping, notes) {

    }
}
