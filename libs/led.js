const EventEmitter = require('eventemitter3');
const logger = require('log4js').getLogger();
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
    constructor(opts) {
        super();
        this._ready = false;
        this._active = false;
        this._blinker = undefined;
        this._setup(opts).then((result) => {
            if (result) {
                this._ready();
                // success
            } else {
                // fail
            }
        }).catch((reason) => {
            logger.error(`Error encountered when opening RasPiStatusLED.\nReason: ${reason}`);
        });
    }

    _ready() {
        if (!this._ready) {
            this._ready = true;
            this.refresh();
            this.emit('ready');
        }
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

    get enabled() {
        return this._ready;
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
    _setup(opts) {
        this._led = undefined;
        return new Promise((resolve) => {
            let raspi = require('raspi');
            let gpio = require('raspi-gpio');
            raspi.init(() => {
                // TODO
            });
        });
    }

    _read() {
        // todo: stubbed
        return false;
    }

    _turnOff() {
        if (this._led) {
            // todo: stubbed
        }
    }

    _turnOn() {
        if (this._led) {
            // todo: stubbed
        }
    }
}

class PwmLED extends LED {
    _setup(opts) {
        this._led = undefined;
        return new Promise((resolve) => {
            let raspi = require('raspi');
            let pwm = require('raspi-pwm');
            raspi.init(() => {
                // TODO
            });
        });
    }

    _read() {
        // todo: stubbed
        return false;
    }

    _turnOff() {
        if (this._led) {
            // todo: stubbed
        }
    }

    _turnOn() {
        if (this._led) {
            // todo: stubbed
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
                raspi.init(() => {
                    this._led = new led.LED();
                    this._on = led.ON;
                    this._off = led.OFF;
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
        this._led = undefined;
    }

    request() {
        if (!this._led) {
            this._led = new RasPiStatusLED();
        }
        return this._led;
    }
}

module.exports = new LEDManager();