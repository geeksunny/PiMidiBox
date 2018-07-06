const clear = require('clear');
const inquirer = require('inquirer');
const tools = require('../tools');

const Result = tools.enum('CONTINUE', 'REPEAT', 'EXIT_ERROR', 'EXIT');

class Core {
    // TODO: History object for recursive prompts
    constructor() {
        // TODO
    }

    run(prompt) {
        if (!prompt) {
            throw "No prompt provided!";
        }
        if (prompt.clear) {
            clear();
        }
        inquirer.prompt(prompt.questions), (answers) => {
            // todo: validate
            // todo: handler
            // TODO: if result is a prompt, this.run(result)
        }
        // While !Result.EXIT,EXIT_ERROR
    }
}

// TODO: ChecklistPrompt, TextPrompt, etc ???

class Prompt {
    // TODO: setter/getter for onResult/validator function/promise
    // TODO: choices getter base method
    constructor({message, type, defaultValue, name = 'result', clear = true} = {}) {
        this._type = type;
        this._message = message;
        this._default = defaultValue;
        this.name = name;
        this.clear = clear;
    }

    get questions() {
        return [{
            type: this._type,
            name: this.name,
            message: this._message,
            choices: this.choices
        }];
    }

    get clear() {
        return this._clear;
    }

    set clear(clear) {
        this._clear = clear;
    }

    get name() {
        return this._name;
    }

    set name(name) {
        this._name = name;
    }

    get choices() {
        return undefined;
    }

    handler(answer) {
        //
    }

    validate(answer) {
        return Result.CONTINUE; // Stubbed
    }
}

class Menu extends Prompt {
    constructor() {
        super();
        this._choices = [];
    }

    add(title, action) {
        this._choices.push({title, action});
    }

    get choices() {
        for (let choice of this._choices) {
            // todo
        }
        return super.choices;
    }
}

class PromptSequence extends Prompt {
    // TODO: refactor for individualized sequential prompt handler/validate processing, able to break the sequence.
    constructor() {
        super();
        this._prompts = [];
    }

    add(name, prompt) {
        prompt.name = name;
        // TODO: use name for handler/validate processing
        this._prompts.push(prompt);
    }

    get questions() {
        let result = [];
        for (let prompt of this._prompts) {
            result.push(... prompt.questions);
        }
        return result;
    }
}

module.exports = { Core, Prompt, PromptSequence, Menu };