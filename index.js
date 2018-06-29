const argv = require('yargs')
    .usage('Usage: $0 [options]')
    .option('a', {
        alias: 'all',
        default: false,
        description: 'route traffic from all inputs to all outputs',
        type: 'boolean'
    })
    .option('c', {
        alias: 'config',
        default: `${__dirname}/config.json`,
        description: 'Path to configuration file',
        type: 'string'
    })
    .option('configure', {
        default: false,
        description: 'Run configuration wizard',
        type: 'boolean'
    })
    .option('l', {
        alias: 'list',
        default: false,
        description: 'List all connected MIDI devices',
        type: 'boolean'
    })
    .option('h', {
        alias: 'hotplug',
        default: true,
        description: 'Maintain device connections after starting the router',
        type: 'boolean'
    })
    .argv;
// TODO: Merge argument options with config file options - https://github.com/yargs/yargs/blob/HEAD/docs/api.md#config

if (argv.configure) {
    // TODO: Execute configuration wizard.
    console.log('Configuration Wizard invoked.');
    // Replace config?
    // List devices; Checkboxes for nicknaming devices
    // Input name for new mapping
    // Select inputs; checkboxes
    // Select outputs; checkboxes
    // Features? checkboxes OR sequential prompts?
    process.exit();
} else if (argv.list) {
    let devices = require('./libs/midi/core').Core.deviceMap;
    for (let name in devices) {
        for (let port in devices[name]) {
            console.log(`${name}, ${port}`);
        }
    }
    process.exit()
}

const Router = require('./libs/midi/router');
const midiRouter = new Router.Router();
midiRouter.loadConfig(argv.config);
// Handle exit events.
require('signal-exit')((code, signal) => {
    console.log(`Exit event detected: ${signal} (${code})`);
    midiRouter.onExit();
});
process.on('uncaughtException', (err) => {
    console.log(`UncaughtException: ${err}`);
    process.exit(1);
});
// Set up IPC server.
const ipc = require('./config/ipc').request('master');
ipc.serve(() => {
    console.log('IPC server started!');
    // TODO: stuff below should probably be in the Clock.Master
    // ipc.server.on('clock.connect', (data, socket) => {
    //     // todo: set up clock in router
    // });
    // ipc.server.on('clock.tick', (data, socket) => {
    //     // todo: tick the clock
    // });
    // TODO: should we move the Router init into this callback? IF ipc.server.on is called before ipc.serve(), will that screw things up? TEST!!!
});
ipc.server.start();
// Ready!
console.log('Ready.');
