const components = require('./components');

// Replace config?
// List devices; Checkboxes for nicknaming devices
// Input name for new mapping
// Select inputs; checkboxes
// Select outputs; checkboxes
// Features? checkboxes OR sequential prompts?


let mainMenu = new components.Menu();
mainMenu.add('Create a fresh configuration', null);
// TODO: only add if expected config filename exists (and is valid?)
let updateMenu = new components.Menu();
updateMenu.add('Create a new mapping', null);
updateMenu.add('Modify an existing mapping', null);
updateMenu.add('Toggle global features', null);
mainMenu.add('Update the configuartion on file', updateMenu);


module.exports = (configPath) => {
    // TODO: take in session's configuration file path
    new components.Core().run(mainMenu);
};