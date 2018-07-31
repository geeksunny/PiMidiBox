const logger = require('log4js').getLogger();

class RasPiStatusLED {
    constructor() {
        this._active = false;
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
                    this.refresh();
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

    refresh() {
        if (this._led) {
            // TODO: test if === will work below.
            this._active = this._led.read() == this._on;
        }
    }

    blink(durationOn, durationOff) {
        if (!this._led) {
            return;
        }
        if (durationOff === undefined) {
            durationOff = durationOn;
        }
        // TODO: Blink with setInterval(), maintain a this.blinking flag
    }

    blinkPattern(/*TODO*/) {
        if (!this._led) {
            return;
        }
        // TODO: Logic for managing blinking patterns
    }

    stopBlinking() {
        // TODO: Stop blinking if active
    }

    get active() {
        return this._active;
    }

    set active(active) {
        if (this._led) {
            if (active) {
                if (!this._active) {
                    this._active = true;
                    this._led.write(this._on);
                }
            } else {
                if (this._active) {
                    this._active = false;
                    this._led.write(this._off);
                }
            }
        }
    }

    get blinking() {
        // TODO
    }

    get enabled() {
        return !!this._led;
    }
}

// TODO: Eventually, support for gpio-based LEDs (and other interfaces) can be added here.
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