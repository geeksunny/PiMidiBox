module.exports = {

    isEmpty(obj) {
        if (typeof obj === 'undefined' || obj === null) {
            return true;
        } else if (obj instanceof Array) {
            let empty = obj.length === 0;
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
            return obj.length === 0;
        } else {
            return false;
        }
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
            console.log(`Item: ${item}`);
            console.log(`Item mac: ${item.mac}`);
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
