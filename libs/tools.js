module.exports = {

    /**
     * A collection of functions that handle common string formatting actions.
     */
    StringFormat: {
        capitalize(word) {
            return word.replace(/\w/, c => c.toUpperCase());
        },
        pascalCase(string) {
            return this.capitalize(this.camelCase(string));
        },
        camelCase(string) {
            let words = string.toLowerCase().split(' ');
            let result = [ words.shift() ];
            words.forEach(word => result.push(this.capitalize(word)));
            return result.join('');
        }
    },

    /**
     * Get the current value of `process.hrtime()` in nanoseconds.
     * @returns {number}
     */
    now() {
        let now = process.hrtime();
        return (+now[0] * 1e9) + (+now[1]);
    },

    /**
     * A more accurate version of setInterval's functionality. Uses `process.hrtime()`
     * to account for clock drift.
     * @param {Function} func - Callback to be executed upon each tick.
     * @param {Number} delay - Interval delay in milliseconds.
     * @param {boolean} [queued] - If true, the first tick won't execute until after the initial delay.
     * Set to false to execute your callback immediately upon calling. Defaults to true.
     * @param {... Object} [params]
     * @returns {wrapper} - An object with a `.cancel()` function for stopping your interval.
     */
    accurateInterval(func, delay, queued = true, ... params) {
        let time = () => {
            let t = process.hrtime();
            // return Math.round((t[0] * 1e3) + (t[1] * 1e-6));
            return Math.round((t[0] * 1000) + (t[1] / 1000000));
        };
        let nextAt = time();
        let wrapper = (... params) => {
            nextAt += delay;
            wrapper.timeout = setTimeout(wrapper, nextAt - time(), ... params);
            func(... params);
        };
        wrapper.cancel = () => {
            clearTimeout(wrapper.timeout);
        };
        Object.defineProperty(wrapper, 'delay', {
            get: () => {
                return delay;
            },
            set: (value) => {
                delay = value;
            },
            enumerable: false,
            configurable: true
        });
        if (queued) {
            nextAt += delay;
            wrapper.timeout = setTimeout(wrapper, nextAt - time(), ... params);
        } else {
            setImmediate(wrapper, ... params);
        }
        return wrapper;
    },

    isEmpty(obj) {
        if (typeof obj === 'undefined' || obj === null) {
            return true;
        } else if (Array.isArray(obj)) {
            let empty = !obj.length;
            if (!empty) {
                for (let i = 0; i < obj.length; i++) {
                    empty = this.isEmpty(obj[i]);
                    if (!empty) {
                        break;
                    }
                }
            }
            return empty;
        } else if (typeof obj === 'string') {
            return !obj.length;
        } else if (typeof obj === 'object') {
            return !Object.keys(obj).length;
        } else {
            return false;
        }
    },

    containsValue(obj, value) {
        for (let val of obj) {
            if (val === value) {
                return true;
            }
        }
        return false;
    },

    isPrimitive(value) {
        return value !== Object(value);
    },

    hasValue(obj) {
        return typeof obj !== 'undefined' && obj !== null;
    },

    removeIndex(index, array) {
        let item = array[index];
        array.splice(index, 1);
        return item;
    },

    removeIndexes(indexes, array) {
        indexes.sort();
        let results = [];
        for (let i in indexes) {
            results.push(this.removeIndex(index - i, array));
        }
        return results;
    },

    findAndRemove(array, finder, multiple = false) {
        let indexes = [];
        for (let i in array) {
            let item = array[i];
            if (finder(item)) {
                if (multiple) {
                    indexes.push(i);
                } else {
                    return this.removeIndex(i, array);
                }
            }
        }
        return (indexes.length) ? this.removeIndexes(indexes, array) : null;
    },

    removeFromArray(value, array) {
        let i = array.indexOf(value);
        if (i > -1) {
            this.removeIndex(i, array);
            return true;
        } else {
            return false;
        }
    },

    combine(...objects) {
        let isArray = (objects[0] instanceof Array);
        let combined = (isArray) ? [] : {};
        this.forEach(objects, (object, key) => {
            this.forEach(object, (child, childKey) => {
                if (isArray) {
                    combined.push(child);
                } else {
                    combined[childKey] = child;
                }
            });
        });
        return combined;
    },

    recursiveCombine(...objects) {
        // TODO: recursively combine objects
    },

    median(values) {
        values.sort((a, b) => {
            return a - b;
        });
        let half = Math.floor(values.length / 2);
        if (values.length % 2) {
            return values[half];
        } else {
            return (values[half-1] + values[half]) / 2;
        }
    },

    clipToRange(value, min, max) {
        if (min > max) {
            max = [min, min = max][0];
        }
        return (value < min) ? min : (value > max) ? max : value;
    },

    withinRange(value, min, max) {
        return this.clipToRange(value, min, max) === value;
    },

    forEach(data, callback) {
        // TODO: implement `thisArg`, Optional third argument
        //  Value to use as this (i.e the reference Object) when executing callback.
        // TODO: deal with the case of null data?
        if (data instanceof Array) {
            data.forEach(callback);
        } else {
            let keys;
            for (let i in keys = Object.getOwnPropertyNames(data)) {
                let key = keys[i];
                callback(data[key], key, data);
            }
        }
    },

    /**
     * Shuffles an array in place.
     * @param {Array} a An array containing the items.
     */
    shuffle(a) {
        for (let i = a.length -1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
    },

    enum(... names) {
        let obj = {};
        for (let name of names) {
            obj[name] = Symbol(name);
        }
        return Object.freeze(obj);
    }

};
