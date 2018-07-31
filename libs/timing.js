const { enum: _enum } = require('tools');

const Resolution = _enum('HOUR', 'MICROSECOND', 'MILLISECOND', 'MINUTE', 'NANOSECOND', 'SECOND');

class TimeUnit {
    static hours(hours) {
        return new TimeUnit(hours, Resolution.HOUR);
    }

    static microseconds(microseconds) {
        return new TimeUnit(microseconds, Resolution.MICROSECOND);
    }

    static milliseconds(milliseconds) {
        return new TimeUnit(milliseconds, Resolution.MILLISECOND);
    }

    static minutes(minutes) {
        return new TimeUnit(minutes, Resolution.MINUTE);
    }

    static nanoseconds(nanoseconds) {
        return new TimeUnit(nanoseconds, Resolution.NANOSECOND);
    }

    static seconds(seconds) {
        return new TimeUnit(seconds, Resolution.SECOND);
    }

    constructor(value, resolution, rounding = true) {
        this.resolution = resolution;
        this.value = value;
        this.rounding = rounding;
    }

    get resolution() {
        return this._resolution;
    }

    set resolution(resolution) {
        switch (resolution) {
            case Resolution.HOUR:
            case Resolution.MICROSECOND:
            case Resolution.MILLISECOND:
            case Resolution.MINUTE:
            case Resolution.NANOSECOND:
            case Resolution.SECOND:
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
            case Resolution.HOUR:
                return this.hour;
            case Resolution.MICROSECOND:
                return this.microsecond;
            case Resolution.MILLISECOND:
                return this.millisecond;
            case Resolution.MINUTE:
                return this.minute;
            case Resolution.NANOSECOND:
                return this.nanosecond;
            case Resolution.SECOND:
                return this.second;
            default:
                return this._value;
        }
    }

    set value(value) {
        switch (this.resolution) {
            case Resolution.HOUR:
                this.hour = value;
                break;
            case Resolution.MICROSECOND:
                this.microsecond = value;
                break;
            case Resolution.MILLISECOND:
                this.millisecond = value;
                break;
            case Resolution.MINUTE:
                this.minute = value;
                break;
            case Resolution.NANOSECOND:
                this.nanoseconds = value;
                break;
            case Resolution.SECOND:
                this.second = value;
                break;
        }
    }

    get hour() {
        let value = this._value / 3.6000E+12;
        return (this._rounding) ? Math.round(value) : value;
    }

    set hour(hours) {
        this._value = hours * 3.6000E+12;
    }

    get microsecond() {
        let value = this._value / 1000;
        return (this._rounding) ? Math.round(value) : value;
    }

    set microsecond(microseconds) {
        this._value = microseconds * 1000;
    }

    get millisecond() {
        let value = this._value / 1000000;
        return (this._rounding) ? Math.round(value) : value;
    }

    set millisecond(milliseconds) {
        this._value = milliseconds * 1000000;
    }

    get minute() {
        let value = this._value / 6.0000E+10;
        return (this._rounding) ? Math.round(value) : value;
    }

    set minute(minutes) {
        this._value = minutes * 6.0000E+10;
    }

    get nanosecond() {
        let value = this._value;
        return (this._rounding) ? Math.round(value) : value;
    }

    set nanosecond(nanoseconds) {
        this._value = nanoseconds;
    }

    get second() {
        let value = this._value / 1.0000E+9;
        return (this._rounding) ? Math.round(value) : value;
    }

    set second(seconds) {
        this._value = seconds * 1.0000E+9;
    }
}

const now = (resolution = Resolution.MILLISECOND, rounded = true) => {
    let t = process.hrtime();
    let value;
    switch (resolution) {
        case Resolution.HOUR:
            value = (t[0] + t[1]) / 60 / 60;
            break;
        case Resolution.MICROSECOND:
            value = (t[0] * 1e6) + (t[1] / 0.001);
            break;
        case Resolution.MILLISECOND:
            value = (t[0] * 1000) + (t[1] / 1000000);
            break;
        case Resolution.MINUTE:
            value = (t[0] + t[1]) / 60;
            break;
        case Resolution.NANOSECOND:
            value = (t[0] * 1e9) + t[1];
            break;
        case Resolution.SECOND:
            value = t[0] + t[1];
            break;
        default:
            throw new TypeError('Resolution must be a value from `Resolution`');
    }
    return (rounded) ? Math.round(value) : value;
};

module.exports = { now, Resolution, TimeUnit };