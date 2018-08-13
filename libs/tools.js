let tools = {

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
     * Recursively freeze the contents of a given object.
     * @param {Object} obj
     * @returns {Object} A frozen version of the given object.
     */
    deepFreeze(obj) {
        let result = {};
        for (let { 0: key, 1: value } of Object.entries(obj)) {
            result[key] = (value && typeof value === 'object') ? tools.deepFreeze(value) : value;
        }
        return Object.freeze(result);
    },

    reverseDict(dict, stackDuplicates = false) {
        let result = {};
        for (let { 0: key, 1: val } of Object.entries(dict)) {
            if (!result[val]) {
                result[val] = key;
            } else if (stackDuplicates) {
                if (!Array.isArray(result[val])) {
                    result[val] = [ result[val] ];
                }
                result[val].push(key);
            }
        }
        return result;
    },

    escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    },

    isEmpty(obj) {
        if (typeof obj === 'undefined' || obj === null) {
            return true;
        } else if (Array.isArray(obj)) {
            let empty = !obj.length;
            if (!empty) {
                for (let i = 0; i < obj.length; i++) {
                    empty = tools.isEmpty(obj[i]);
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

    /**
     * Tests all passed objects to determine they are not undefined or null.
     * @param {Object[]} objects
     * @returns {boolean} true if all objects are considered defined.
     */
    areDefined(... objects) {
        for (let obj of objects) {
            if (obj === undefined || obj === null) {
                return false;
            }
        }
        return true;
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
            results.push(tools.removeIndex(index - i, array));
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
                    return tools.removeIndex(i, array);
                }
            }
        }
        return (indexes.length) ? tools.removeIndexes(indexes, array) : null;
    },

    removeFromArray(value, array) {
        let i = array.indexOf(value);
        if (i > -1) {
            tools.removeIndex(i, array);
            return true;
        } else {
            return false;
        }
    },

    /**
     * Combine two or more objects into a single new object. The resulting object will match the
     * type of the first argument passed. When combining non-array objects into an array, the Object's
     * values will be added as an array consisting of [key, value].
     * @param objects
     * @returns {Array|Object} The resulting combined object. Type will match the first argument passed.
     */
    combine(... objects) {
        let result;
        if (Array.isArray(objects[0])) {
            result = [ ... objects.shift() ];
            for (let object of objects) {
                if (object) {
                    result.push(... (Array.isArray(object)) ? object : Object.entries(object));
                }
            }
        } else {
            let i = 0;
            for (let object of objects) {
                if (!object) {
                    continue;
                }
                if (Array.isArray(object)) {
                    for (let item of object) {
                        result[i++] = item;
                    }
                } else {
                    for (let entry of Object.entries(object)) {
                        result[entry[0]] = entry[1];
                    }
                }
            }
        }
        return result;
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
        return tools.clipToRange(value, min, max) === value;
    },

    forEach(data, callback) {
        // TODO: implement `thisArg`, Optional third argument
        //  Value to use as this (i.e the reference Object) when executing callback.
        if (data instanceof Array) {
            data.forEach(callback);
        } else if (data) {
            for (let entry of Object.entries(data)) {
                callback(entry[1], entry[0], data);
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

    symbolName(symbol) {
        if (typeof symbol === 'string') {
            return symbol;
        } else if (typeof symbol === 'symbol') {
            let s = symbol.toString();
            let matches = /Symbol\((.+)\)/.exec(s);
            return (matches) ? matches[1] : s;
        } else {
            return undefined;
        }
    },

    enum(... names) {
        let obj = {};
        for (let name of names) {
            if (typeof name !== 'string') {
                throw new TypeError(`Name must be a string!`);
            }
            obj[name] = Symbol(name);
        }
        obj.validate = (value) => {
            let name = tools.symbolName(value);
            return (name && name in obj);
        };
        return Object.freeze(obj);
    }

};

module.exports = tools;