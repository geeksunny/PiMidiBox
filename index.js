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
    .option('r', {
        alias: 'reload-usb',
        default: true,
        description: 'reload routing map on new USB connections',
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
} else if (argv.list) {
    let devices = require('./libs/midi/core').deviceMap;
    for (let name in devices) {
        for (let port in devices[name]) {
            console.log(`${name}, ${port}`);
        }
    }
    process.exit()
} else {
    const Router = require('./libs/midi/router');
    const midiRouter = new Router();
    midiRouter.loadConfig(argv.config);
    console.log('Ready.');
}