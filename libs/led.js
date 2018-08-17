const EventEmitter = require('eventemitter3');
const logger = require('log4js').getLogger();
const morsecode = require('./morsecode');
const timing = require('./timing');

class Blinker extends EventEmitter {
    constructor(led) {
        if (!(led instanceof LED)) {
            throw "LED required for Blinker construction!";
        }
        super();
        this._led = led;
        this._blinking = false;
        this._intervals = [];
        this._task = undefined;
    }

    get blinking() {
        return this._blinking;
    }

    get intervals() {
        return [... this._intervals];
    }

    set intervals(intervals) {
        if (!Array.isArray(intervals)) {
            intervals = [ intervals ];
        }
        this._intervals = [];
        for (let interval of intervals) {
            if (typeof interval !== 'number' || interval < 1) {
                continue;
            }
            this._intervals.push(interval);
        }
        if (!this._intervals.length) {
            throw `Invalid value provided for intervals! (${intervals})`;
        }
        if (this._blinking) {
            this._task.cancel();
            this._task = timing.accurateInterval(this._led.toggle, this._intervals, false);
        }
    }

    start(... durations) {
        if (!this._blinking) {
            if (durations.length) {
                this.intervals = durations;
            }
            if (!this._intervals.length) {
                throw 'No blink durations provided!';
            }
            if (this._task) {
                this._task.cancel();
            }
            this._task = timing.accurateInterval(this._led.toggle, this._intervals, false);
            this._blinking = true;
            this.emit('start');
        } else if (durations.length) {
            this.intervals = durations;
        }
    }

    stop(turnOff = true) {
        if (this._blinking && this._task) {
            this._task.cancel();
            this._task = undefined;
            if (turnOff) {
                this._led.off();
            }
            this._blinking = false;
            this.emit('stop');
        }
    }

    toggle() {
        if (this._blinking) {
            this.stop();
        } else {
            this.start();
        }
    }
}

class LED extends EventEmitter {
    constructor(opts = {}) {
        super();
        this._opts = opts;
        this._ready = false;
        this._active = false;
        this._blinker = undefined;
        this._setup(opts).then((success) => {
            if (success) {
                this._ready = true;
                this.refresh();
                this.emit('ready');
            } else {
                // fail
            }
        }).catch((reason) => {
            logger.error(`Error encountered when opening ${this.constructor.name}.\nReason: ${reason}`);
        });
    }

    /**
     * Read the active state from the LED.
     * @returns {boolean} - True if LED is lit.
     * @private
     */
    _read() {
        throw "Not implemented!";
    }

    /**
     * Perform asynchronous setup operations with a {Promise} object.
     * @returns {Promise} A promise performing the LED setup, resolved with a truthy value if successful.
     * @private
     */
    _setup() {
        throw "Not implemented!";
    }

    _turnOff() {
        throw "Not implemented!";
    }

    _turnOn() {
        throw "Not implemented!";
    }

    refresh() {
        if (this._ready) {
            this._active = this._read();
        }
    }

    blink(durationOn, durationOff = 0) {
        // TODO: cycles argument & logic
        if (!this._ready || !this._blinker) {
            return;
        }
        if (!durationOff) {
            this.blinkPattern(durationOn);
        } else {
            this.blinkPattern(durationOn, durationOff);
        }
    }

    blinkPattern(... durations) {
        // TODO: cycles argument & logic
        if (this._ready) {
            let blinker = this.blinker;
            if (blinker) {
                blinker.start(... durations);
            }
        }
    }

    stopBlinking(turnOff = true) {
        if (!this._ready || !this._blinker) {
            return;
        }
        this._blinker.stop(turnOff);
    }

    get active() {
        return this._active;
    }

    set active(active) {
        if (this._ready && this._active !== active) {
            if (active) {
                this._active = true;
                this._turnOn();
            } else {
                this._active = false;
                this._turnOff();
            }
        }
    }

    get blinker() {
        if (!this._blinker && this._ready) {
            this._blinker = new Blinker(this);
        }
        return this._blinker;
    }

    get blinking() {
        let blinker = this.blinker;
        return (blinker && blinker.blinking);
    }

    get config() {
        return {
            type: this.constructor.name,
            opts: this._opts
        };
    }

    get enabled() {
        return this._ready;
    }

    get opts() {
        return this._opts;
    }

    on() {
        if (this._ready && !this._active) {
            this.active = true;
        }
    }

    off() {
        if (this._ready && this._active) {
            this.active = false;
        }
    }

    toggle() {
        this._ready && (this.active = !this._active);
    }
}

class GpioLED extends LED {
    _setup({ pin, pull }) {
        this._led = undefined;
        this._high = undefined;
        this._low = undefined;
        return new Promise((resolve) => {
            try {
                let raspi = require('raspi');
                let gpio = require('raspi-gpio');
                this._high = gpio.HIGH;
                this._low = gpio.LOW;
                raspi.init(() => {
                    let pullResistor;
                    switch (pull.toLowerCase()) {
                        case 'up':
                            pullResistor = gpio.PULL_UP;
                            break;
                        case 'down':
                            pullResistor = gpio.PULL_DOWN;
                            break;
                        case 'none':
                        default:
                            pullResistor = gpio.PULL_NONE;
                    }
                    this._led = new gpio.DigitalInput({ pin, pullResistor });
                    resolve(true);
                });
            } catch (err) {
                this._led = false;
                resolve(false);
            }
        });
    }

    _read() {
        return (this._led && this.led.read() == this._high);
    }

    _turnOff() {
        if (this._led) {
            this._led.write(this._low);
        }
    }

    _turnOn() {
        if (this._led) {
            this._led.write(this._high);
        }
    }
}

class PwmLED extends LED {
    // TODO: Add support for modifying the frequency value directly. ie. set to 0.5 for half brightness.
    _setup({ pin, frequency }) {
        this._led = undefined;
        return new Promise((resolve) => {
            try {
                let raspi = require('raspi');
                let pwm = require('raspi-pwm');
                raspi.init(() => {
                    this._led = new pwm.PWM({ pin, frequency });
                    resolve(true);
                });
            } catch (err) {
                this._led = false;
                resolve(false);
            }
        });
    }

    _read() {
        return (this._led && !!this._led.read());
    }

    _turnOff() {
        if (this._led) {
            this._led.write(0);
        }
    }

    _turnOn() {
        if (this._led) {
            this._led.write(1);
        }
    }
}

class RasPiStatusLED extends LED {
    _setup(opts) {
        this._led = undefined;
        this._off = undefined;
        this._on = undefined;
        return new Promise((resolve) => {
            try {
                let raspi = require('raspi');
                let led = require('raspi-led');
                this._on = led.ON;
                this._off = led.OFF;
                raspi.init(() => {
                    this._led = new led.LED();
                    resolve(true);
                });
            } catch (err) {
                this._led = false;
                resolve(false);
            }
        });
    }

    _read() {
        return (this._led && this._led.read() == this._on);
    }

    _turnOff() {
        if (this._led) {
            this._led.write(this._off);
        }
    }

    _turnOn() {
        if (this._led) {
            this._led.write(this._on);
        }
    }
}

class LEDManager {
    constructor() {
        this._primary = undefined;
        this._gpioIndex = {};
        this._pwmIndex = {};
        this._rasPiStatusLed = undefined;
        this._alertCache = {};
    }

    get config() {
        let result = [];
        for (let led of [... Object.values(this._gpioIndex), ... Object.values(this._pwmIndex), this._rasPiStatusLed]) {
            if (led) {
                result.push(led.config);
            }
        }
        return result;
    }

    set config(config) {
        if (!Array.isArray(config)) {
            config = [ config ];
        }
        for (let cfg of config) {
            switch (cfg.type) {
                case 'GpioLED':
                    this._gpioIndex[cfg.opts.pin] = new GpioLED(cfg.opts);
                    this._ensurePrimary(this._gpioIndex[cfg.opts.pin]);
                    break;
                case 'PwmLED':
                    this._pwmIndex[cfg.opts.pin] = new PwmLED(cfg.opts);
                    this._ensurePrimary(this._pwmIndex[cfg.opts.pin]);
                    break;
                case 'RasPiStatusLED':
                    this._rasPiStatusLed = new RasPiStatusLED();
                    this._ensurePrimary(this._rasPiStatusLed);
                    break;
                default:
                    //
            }
        }
    }

    get primary() {
        return this._primary;
    }

    set primary(led) {
        if (!(led instanceof LED)) {
            throw new TypeError("Primary must extend from LED!");
        }
        this._primary = led;
    }

    /**
     * Ensure that an initial value is set for the primary LED. This is run whenever a new LED is created.
     *      The first LED created by the manager will always be set as the primary LED.
     * @param {LED} led
     * @private
     */
    _ensurePrimary(led) {
        if (!this._primary) {
            this._primary = led;
        }
    }

    /**
     * Open a LED on the Raspberry Pi using GPIO (General Purpose Input Output).
     * @param {string|number} pin - Pin to open.
     *      Valid Formats: (see: https://github.com/nebrius/raspi-io/wiki/Pin-Information)
     *          * Pin function: {string} ex. 'GPIO##'
     *          * Physical pin: {string} ex. 'P#-##'
     *          * WiringPi virtual pin: {number} ex. 7
     * @param {'UP'|'DOWN'|'NONE'} pull='NONE' Which pull resistor to use on the pin, if any.
     * @returns {GpioLED}
     */
    gpio(pin, pull = 'NONE') {
        if (!this._gpioIndex[pin]) {
            this._gpioIndex[pin] = new GpioLED({ pin, pull });
            this._ensurePrimary(this._gpioIndex[pin]);
        }
        return this._gpioIndex[pin];
    }

    /**
     * Open a LED on the Raspberry Pi using PWM (Pulse Width Modulation).
     * @param {string|number} pin - Pin to open.
     *      Valid Formats: (see: https://github.com/nebrius/raspi-io/wiki/Pin-Information)
     *          * Pin function: {string} ex. 'GPIO##', 'PWM#'
     *          * Physical pin: {string} ex. 'P#-##'
     *          * WiringPi virtual pin: {number} ex. 7
     * @returns {PwmLED}
     */
    pwm(pin) {
        if (!this._pwmIndex[pin]) {
            this._pwmIndex[pin] = new PwmLED({ pin });
            this._ensurePrimary(this._pwmIndex[pin]);
        }
        return this._pwmIndex[pin];
    }

    /**
     * Open the status LED on a Raspberry Pi.
     * @returns {RasPiStatusLED}
     */
    get RasPiStatusLED() {
        if (!this._rasPiStatusLed) {
            this._rasPiStatusLed = new RasPiStatusLED();
            this._ensurePrimary(this._rasPiStatusLed);
        }
        return this._rasPiStatusLed();
    }

    /**
     * Encode a message as Morse code and blink it on the currently set primary LED.
     * @param {string} msg - The message to be encoded and blinked.
     * @param {number} [cycles=3] - How many cycles the pattern should be blinked.
     * @param {boolean} [cache=true] - Should the encoded message pattern be cached for later re-use.
     */
    alert(msg, cycles = 3, cache = true) {
        if (!this._primary) {
            logger.warn(`Primary LED does not exist; Alert will be ignored.`);
            return;
        }
        let timings;
        if (cache) {
            if (!this._alertCache[msg]) {
                this._alertCache[msg] = morsecode.timings(msg);
            }
            timings = this._alertCache[msg];
        } else {
            timings = morsecode.timings(msg);
        }
        this._primary.blinkPattern(... timings);
    }
}

module.exports = new LEDManager();