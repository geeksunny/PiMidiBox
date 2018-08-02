const EventEmitter = require('eventemitter3');
const logger = require('log4js').getLogger();

class Blinker extends EventEmitter {
    constructor(led) {
        if (!led) {
            throw "LED required for Blinker construction!";
        }
        super();
        this._led = led;
        this._blinking = false;
        this._intervals = [];
        this._currentInterval = 0;
        this._task = undefined;
    }

    get blinking() {
        return this._blinking;
    }

    get intervals() {
        return [... this._intervals];
    }

    set intervals(intervals) {
        if (typeof intervals === 'number') {
            // TODO: update intervals, AND this._task. handle switching between setInterval & setTimeout
        } else if (Array.isArray(intervals)) {
            // TODO: update intervals, AND this._task. handle switching between setInterval & setTimeout
        } else {
            throw `Invalid value provided for intervals! (${intervals})`;
        }
    }

    start(... durations) {
        if (!this._blinking) {
            this._intervals = [];
            this._currentInterval = 0;
            for (let duration of durations) {
                if (typeof duration !== 'number' && duration < 1) {
                    continue;
                }
                // TODO: Should there be a minimum duration enforced?
                this._intervals.push(duration);
            }
            switch (this._intervals.length) {
                case 0:
                    return;
                case 1:
                    this._task = setInterval(this._led.toggle, this._intervals[0]);
                    break;
                default:
                    this._task = setTimeout(() => {
                        if (this._currentInterval >= this._intervals.length) {
                            this._currentInterval = 0;
                        }
                        this._task = setTimeout(this, this._intervals[this._currentInterval++]);
                    }, this._intervals[this._currentInterval++]);
            }
            this._blinking = true;
            this.emit('start');
        } else {
            this.intervals = durations;
        }
    }

    stop(turnOff = true) {
        if (this._blinking) {
            if (this._intervals.length === 1) {
                clearInterval(this._task);
            } else {
                clearTimeout(this._task);
            }
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
    constructor() {
        super();
        this._ready = false;
        this._active = false;
        this._blinker = undefined;
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

class RasPiStatusLED extends LED {
    _setup() {
        this._led = undefined;
        this._off = undefined;
        this._on = undefined;
        new Promise((resolve) => {
            try {
                let raspi = require('raspi');
                let led = require('raspi-led');
                raspi.init(() => {
                    this._led = new led.LED();
                    this._on = led.ON;
                    this._off = led.OFF;
                    this._ready();
                    resolve(true);
                });
            } catch (err) {
                this._led = false;
                resolve(false);
            }
        }).catch((reason) => {
            logger.error(`Error encountered when opening RasPiStatusLED.\nReason: ${reason}`);
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