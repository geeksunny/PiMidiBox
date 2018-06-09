const Router = require('./libs/midi/router');
const midiRouter = new Router();
midiRouter.loadConfig(`${__dirname}/config.json`);
console.log('Ready.');