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
    .option('h', {
        alias: 'hotplug',
        default: true,
        description: 'Maintain device connections after starting the router',
        type: 'boolean'
    })
    .option('kill', {
        default: false,
        description: 'Send a kill signal to the running Router service.',
        type: 'boolean'
    })
    .option('l', {
        alias: 'list',
        default: false,
        description: 'List all connected MIDI devices',
        type: 'boolean'
    })
    .option('monitor', {
        default: false,
        description: 'Monitor mode, reports all MIDI traffic for easy inspection',
        type: 'boolean'
    })
    .option('s', {
        alias: 'sysex',
        default: undefined,
        description: 'Path to a sysex file to send and the output it should be sent to, separated by a space.',
        type: 'array'
    })
    .option('v', {
        alias: 'verbose',
        default: false,
        description: 'More console output',
        type: 'boolean'
    })
    .argv;
global.configPath = argv.config;
// TODO: Merge argument options with config file options - https://github.com/yargs/yargs/blob/HEAD/docs/api.md#config
const logger = require('log4js').getLogger();
logger.level = (argv.verbose) ? 'all' : 'warn'; // TODO: error instead of warn?

if (argv.configure) {
    // TODO: Execute configuration wizard.
    logger.info('Configuration Wizard invoked.');
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
} else if (argv.monitor) {
    let { Monitor } = require('./libs/midi/utils');
    let m = new Monitor();
    m.handler = (device, message) => {
        logger.debug(`Device: ${device.name} | Channel: ${message.channel} | Controller: ${message.controller} | Value: ${message.value}`);
    };
} else {
    const ipcManager = require('./config/ipc');
    if (argv.kill) {
        const ipc = ipcManager.client('messenger', 'master');
        ipc.start(() => {
            ipc.emit('kill');
            ipc.stop();
            process.exit(0);
        });
    } else if (argv.sysex) {
        // TODO: Expand and validate file path (argv.sysex[0])
        const ipc = ipcManager.client('messenger', 'master');
        ipc.on('error', (e) => {
            // TODO: Verify what contents of `e` is with no response from an active IPC server. (`ETIMEDOUT`?)
            const { SysexLoader } = require('./libs/midi/utils');
            let sysex = new SysexLoader(argv.sysex[0], argv.sysex[1]);
            sysex.send();
            process.exit(0);
        });
        ipc.start(() => {
            ipc.emit('router.sysex', { path: argv.sysex[0], output: argv.sysex[1] });
            process.exit(0);
        });
    } else {
        const Router = require('./libs/midi/router');
        const midiRouter = new Router.Router();
        const ledManager = require('./libs/led');
        // Handle exit events.
        require('signal-exit')((code, signal) => {
            logger.info(`Exit event detected: ${signal} (${code})`);
            let led = ledManager.primary;
            if (led) {
                led.on();
            }
            midiRouter.onExit();
        });
        process.on('uncaughtException', (err) => {
            logger.error(`UncaughtException: ${err}`);
            process.exit(1);
        });
        // Set up IPC server.
        const ipc = ipcManager.server('master');
        ipc.on('error', (e) => {
            if (e.code === 'EADDRINUSE') {
                logger.error(`Cannot be started. Service is already running. (EADDRINUSE)`);
                process.exit(1);
            }
        });
        ipc.on('kill', () => {
            logger.info('IPC server killed by remote command.');
            process.exit(0);
        });
        ipc.start(() => {
            logger.info('IPC server started!');
            midiRouter.loadConfig(argv.config);
            ipc.on('router.sysex', (args) => {
                midiRouter.sendSysex(args.path, args.output);
            });
            // Ready!
            logger.info('Ready.');
        });
    }
}
