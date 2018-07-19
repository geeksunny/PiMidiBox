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
    .option('v', {
        alias: 'verbose',
        default: false,
        description: 'More console output',
        type: 'boolean'
    })
    .argv;
// TODO: Merge argument options with config file options - https://github.com/yargs/yargs/blob/HEAD/docs/api.md#config
const logger = require('log4js').getLogger();
logger.level = (argv.verbose) ? 'all' : 'warn'; // TODO: error instead of warn?

if (argv.configure) {
    // TODO: Execute configuration wizard.
    logger.log('Configuration Wizard invoked.');
    const wizard = require('./libs/wizard');
    wizard(argv.config);
    process.exit();
} else if (argv.list) {
    let devices = require('./libs/midi/core').Core.deviceMap;
    for (let name in devices) {
        for (let port in devices[name]) {
            logger.debug(`${name}, ${port}`);
        }
    }
    process.exit()
}

const Router = require('./libs/midi/router');
const midiRouter = new Router.Router();
midiRouter.loadConfig(argv.config);
// Handle exit events.
require('signal-exit')((code, signal) => {
    logger.log(`Exit event detected: ${signal} (${code})`);
    midiRouter.onExit();
});
process.on('uncaughtException', (err) => {
    logger.error(`UncaughtException: ${err}`);
    process.exit(1);
});
// Set up IPC server.
const ipc = require('./config/ipc').request('master');
ipc.serve(() => {
    logger.log('IPC server started!');
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
logger.log('Ready.');
