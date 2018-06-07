// Set current working directory
const files = require('./libs/files');
files.getCurrentDirectoryBase();

const Midi = require('./libs/midi/core');
const midiCore = new Midi.Core();
midiCore.loadConfig('../../config.json');
console.log('test');