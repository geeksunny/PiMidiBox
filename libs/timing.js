const { enum: _enum } = require('./tools');

const Resolution = _enum('NANOSECOND', 'MICROSECOND', 'MILLISECOND', 'SECOND', 'MINUTE', 'HOUR');

class TimeUnit {
    static nanoseconds(nanoseconds) {
        return new TimeUnit(nanoseconds, Resolution.NANOSECOND);
    }

    static microseconds(microseconds) {
        return new TimeUnit(microseconds, Resolution.MICROSECOND);
    }

    static milliseconds(milliseconds) {
        return new TimeUnit(milliseconds, Resolution.MILLISECOND);
    }

    static seconds(seconds) {
        return new TimeUnit(seconds, Resolution.SECOND);
    }

    static minutes(minutes) {
        return new TimeUnit(minutes, Resolution.MINUTE);
    }

    static hours(hours) {
        return new TimeUnit(hours, Resolution.HOUR);
    }

    constructor(value, resolution, rounding = true) {
        this.resolution = resolution;
        this.rounding = rounding;
        this.value = value;
    }

    get resolution() {
        return this._resolution;
    }

    set resolution(resolution) {
        switch (resolution) {
            case Resolution.NANOSECOND:
            case Resolution.MICROSECOND:
            case Resolution.MILLISECOND:
            case Resolution.SECOND:
            case Resolution.MINUTE:
            case Resolution.HOUR:
                this._resolution = resolution;
                break;
            default:
                throw new TypeError('Resolution must be a value from `Resolution`');
        }
    }

    get rounding() {
        return this._rounding;
    }

    set rounding(enabled) {
        this._rounding = !!enabled;
    }

    get value() {
        switch (this.resolution) {
            case Resolution.NANOSECOND:
                return this.nanoseconds;
            case Resolution.MICROSECOND:
                return this.microseconds;
            case Resolution.MILLISECOND:
                return this.milliseconds;
            case Resolution.SECOND:
                return this.seconds;
            case Resolution.MINUTE:
                return this.minutes;
            case Resolution.HOUR:
                return this.hours;
            default:
                return this._value;
        }
    }

    set value(value) {
        if (typeof value === 'string') {
            value = parseInt(value);
        }
        if (typeof value !== 'number') {
            throw new TypeError(`Invalid value type provided. (${value})`);
        }
        switch (this.resolution) {
            case Resolution.NANOSECOND:
                this.nanoseconds = value;
                break;
            case Resolution.MICROSECOND:
                this.microseconds = value;
                break;
            case Resolution.MILLISECOND:
                this.milliseconds = value;
                break;
            case Resolution.SECOND:
                this.seconds = value;
                break;
            case Resolution.MINUTE:
                this.minutes = value;
                break;
            case Resolution.HOUR:
                this.hours = value;
                break;
        }
    }

    get nanoseconds() {
        let value = this._value;
        return (this._rounding) ? Math.round(value) : value;
    }

    set nanoseconds(nanoseconds) {
        this._value = Math.abs(nanoseconds);
    }

    get microseconds() {
        let value = this._value / 1000;
        return (this._rounding) ? Math.round(value) : value;
    }

    set microseconds(microseconds) {
        this._value = Math.abs(microseconds * 1000);
    }

    get milliseconds() {
        let value = this._value / 1000000;
        return (this._rounding) ? Math.round(value) : value;
    }

    set milliseconds(milliseconds) {
        this._value = Math.abs(milliseconds * 1000000);
    }

    get seconds() {
        let value = this._value / 1.0000E+9;
        return (this._rounding) ? Math.round(value) : value;
    }

    set seconds(seconds) {
        this._value = Math.abs(seconds * 1.0000E+9);
    }

    get minutes() {
        let value = this._value / 6.0000E+10;
        return (this._rounding) ? Math.round(value) : value;
    }

    set minutes(minutes) {
        this._value = Math.abs(minutes * 6.0000E+10);
    }

    get hours() {
        let value = this._value / 3.6000E+12;
        return (this._rounding) ? Math.round(value) : value;
    }

    set hours(hours) {
        this._value = Math.abs(hours * 3.6000E+12);
    }
}

const now = function(resolution = Resolution.MILLISECOND, rounded = true) {
    let value;
    switch (resolution) {
        case Resolution.NANOSECOND:
            value = this.nanoseconds();
            break;
        case Resolution.MICROSECOND:
            value = this.microseconds();
            break;
        case Resolution.MILLISECOND:
            value = this.milliseconds();
            break;
        case Resolution.SECOND:
            value = this.seconds();
            break;
        case Resolution.MINUTE:
            value = this.minutes();
            break;
        case Resolution.HOUR:
            value = this.hours();
            break;
        default:
            throw new TypeError('Resolution must be a value from `Resolution`');
    }
    return (rounded) ? Math.round(value) : value;
};

now.nanoseconds = () => {
    let t = process.hrtime();
    return (t[0] * 1e9) + t[1];
};

now.microseconds = () => {
    let t = process.hrtime();
    return (t[0] * 1e6) + (t[1] / 0.001);
};

now.milliseconds = () => {
    let t = process.hrtime();
    return (t[0] * 1000) + (t[1] / 1000000);
};

now.seconds = () => {
    let t = process.hrtime();
    return t[0] + t[1];
};

now.minutes  = () => {
    let t = process.hrtime();
    return (t[0] + t[1]) / 60;
};

now.hours = () => {
    let t = process.hrtime();
    return (t[0] + t[1]) / 60 / 60;
};

const pattern = (resolution, ... intervals) => {
    if (!Resolution.validate(resolution)) {
        throw `Invalid resolution provided. (${resolution})`;
    }
    let result = [];
    for (let interval of intervals) {
        result.push(new TimeUnit(interval, resolution));
    }
    return result;
};

/**
 * A more accurate version of setInterval's functionality. Uses `process.hrtime()` to account for clock drift.
 * @param {Function} func - Callback to be executed upon each tick.
 * @param {TimeUnit|Number|Array<TimeUnit|Number>} delay - Interval delay as a {TimeUnit} object defining
 * the duration and it's resolution. Alternatively, passing a {Number} will be handled as {Resolution.MILLISECOND}.
 * Pass an array of delay values to create a repeating timed sequential pattern.
 * @param {boolean} [queued] - If true, the first tick won't execute until after the initial delay.
 * Set to false to execute your callback immediately upon calling. Defaults to true.
 * @param {... Object} [params]
 * @returns {wrapper} - An object with a `.cancel()` function for stopping your interval.
 */
const accurateInterval = (func, delay, queued = true, ... params) => {
    // Delay validation, preparation
    let prepareDelay = (delay) => {
        let delays = [];
        if (!Array.isArray(delay)) {
            delay = [ delay ];
        }
        for (let time of delay) {
            // Delay type correction and validation
            if (typeof time === 'string') {
                time = parseInt(time);
            }
            if (typeof time === 'number') {
                time = new TimeUnit(time, Resolution.MILLISECOND);
            }
            if (!(time instanceof TimeUnit)) {
                throw new TypeError(`Invalid delay provided. (${time})`);
            }
            // Delay value validation
            let _time = Math.abs(time.nanoseconds);
            if (_time === 0) {
                throw 'Interval delay must be non-zero!';
            }
            delays.push(_time);
        }
        if (!delays.length) {
            throw 'Delay must contain at least one number!';
        }
        return delays;
    };
    // Delay set, change logic
    let intervals, _delay;
    let increment, i, size;
    let updateDelay = (delay) => {
        intervals = prepareDelay(delay);
        _delay = intervals[0];
        increment = intervals.length > 1;
        if (increment) {
            i = queued ? 1 : 0;
            size = intervals.length;
        }
    };
    updateDelay(delay);
    // Create the interval wrapper
    let _now = now.nanoseconds;
    let nextAt = _now();
    let wrapper = function(... params) {
        if (increment) {
            _delay = intervals[i++];
            if (i === size) {
                i = 0;
            }
        }
        nextAt += _delay;
        wrapper.timeout = setTimeout(this, nextAt - _now(), ... params);
        func(... params);
    };
    wrapper.cancel = () => {
        clearTimeout(this.timeout);
    };
    Object.defineProperty(wrapper, 'delay', {
        get: () => {
            return intervals.length > 1 ? intervals : intervals[0];
        },
        set: (value) => {
            updateDelay(value);
        },
        enumerable: false,
        configurable: true
    });
    // Start repeating task
    if (queued) {
        nextAt += _delay;
        wrapper.timeout = setTimeout(wrapper, nextAt - _now(), ... params);
    } else {
        setImmediate(wrapper, ... params);
    }
    // Return the wrapper for cancellation
    return wrapper;
};

module.exports = { accurateInterval, now, pattern, Resolution, TimeUnit };