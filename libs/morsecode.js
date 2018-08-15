const tools = require('./tools');

const ENCODE_MAP = tools.deepFreeze({
    A: '.-',
    B: '-...',
    C: '-.-.',
    D: '-..',
    E: '.',
    F: '..-.',
    G: '--.',
    H: '....',
    I: '..',
    J: '.---',
    K: '-.-',
    L: '.-..',
    M: '--',
    N: '-.',
    O: '---',
    P: '.--.',
    Q: '--.-',
    R: '.-.',
    S: '...',
    T: '-',
    U: '..-',
    V: '...-',
    W: '.--',
    X: '-..-',
    Y: '-.--',
    Z: '--..',
    1: '.----',
    2: '..---',
    3: '...--',
    4: '....-',
    5: '.....',
    6: '-....',
    7: '--...',
    8: '---..',
    9: '----.',
    0: '-----',
    ",": '--..--',
    ".": '.-.-.-',
    "?": '..--..',
    "!": '---.',
    ";": '-.-.-',
    ":": '---...',
    "/": '-..-.',
    "_": '..--.-',
    "-": '-....-',
    "+": '.-.-.',
    "=": '-...-',
    "'": '.----.',
    "\"": '.-..-.',
    "(": '-.--.',
    ")": '-.--.-',
    "[": '-.--.',
    "]": '-.--.-',
    "@": '.--.-.',
    "$": '...-..-',
    " ": '.......'
});
const DECODE_MAP = tools.deepFreeze(tools.reverseDict(ENCODE_MAP));

const UNITS_DOT = 1;
const UNITS_DASH = 3;
const UNITS_BETWEEN_SIGNS = 1;
const UNITS_BETWEEN_CHARS = 3;
const UNITS_BETWEEN_WORDS = 7;

/**
 * Encode a string as a Morse code pattern.
 * @param {string} s - The string to encode.
 * @param {"/"|"|"|""|ArrayConstructor} [separator='/'] - Character used to separate completed word sequences.
 * @returns {string|Array} - todo
 */
function encode(s, separator = '/') {
    if (typeof s !== 'string') {
        throw new TypeError('s needs to be a string.');
    }
    let words = s.toUpperCase().split(' ');
    let _words = [];
    for (let word of words) {
        let chars = [];
        for (let char of word) {
            if (ENCODE_MAP[char]) {
                chars.push(ENCODE_MAP[char]);
            }
        }
        _words.push(chars.join(' '));
    }
    switch (separator) {
        case '':
        case ' ':
            return _words.join(' ');
        case Array:
            return _words;
        default:
        case '/':
        case '|':
            return _words.join(` ${separator} `);
    }
}

/**
 * Decode one or more Morse code patterns.
 * @param {string|string[]} s - A string or array of strings to be decoded.
 * @param {string} [separator] - Symbol used to separate word sequences if `s` is a {string}.
 *      If no value is passed, the default '/' and '|' will be used.
 * @returns {string}
 */
function decode(s, separator) {
    let words;
    if (Array.isArray(s)) {
        words = s;
    } else {
        words = splitPattern(s, separator);
    }
    let _words = [];
    for (let word of words) {
        let _chars = [];
        let chars = word.split(' ');
        for (let char of chars) {
            _chars.push(DECODE_MAP[char]);
        }
        _words.push(_chars.join(''));
    }
    return _words.join(' ');
}

/**
 * Split a Morse code sentence into an array of words.
 * @param {string} s - The sentence to be split.
 * @param {string} [separator] - An optional string defining a non-standard word separator used in the sentence.
 * @returns {string[]} An array of strings containing each pattern word.
 */
function splitPattern(s, separator) {
    if (typeof s !== 'string') {
        throw new TypeError('Value for s must be a string.');
    }
    let _separator = (typeof separator === 'string' && !!separator.length)
        ? /\s*[/|]\s*/
        : new RegExp(`\s*[${tools.escapeRegExp(separator)}]\s*`);
    return s.split(_separator);
}

/**
 * Determine if a given string is an encoded Morse code pattern.
 * The string will be considered encoded if its character set is limited to '-. /|'
 * @param {string} s - The string to be tested.
 * @param {string} [validChars] - Additional valid characters to be considered.
 * @returns {boolean} True if the string is an encoded Morse code pattern.
 */
function isEncoded(s, validChars) {
    if (typeof s !== 'string') {
        throw new TypeError('Value for s must be a string.');
    }
    let re = (typeof validChars === 'string' && !!validChars.length)
        ? new RegExp(`^[-. /|${tools.escapeRegExp(validChars)}]+$`)
        : /^[-. /|]+$/;
    return !!re.exec(s);
}

/**
 * Create an array of integers representing the durations of state changes based on a Morse code pattern.
 * @param {string} s -todo encoded or decoded
 * @param {number} [wpm=5] - Timing speed in words-per-minute.
 * @returns {number[]}
 */
function timings(s, wpm = 5) {
    if (typeof s !== 'string') {
        throw new TypeError('Value for s must be a string.');
    }
    if (typeof wpm !== 'number') {
        throw new TypeError('Value for wpm must be a number.');
    }
    let unit = 1200 / Math.abs(wpm);
    let pattern = (isEncoded(s)) ? splitPattern(s) : encode(s, Array);
    let result = [];
    for (let word of pattern) {
        let chars = word.split(' ');
        for (let char of chars) {
            for (let sign of char) {
                switch (sign) {
                    case '.':
                        result.push(UNITS_DOT * unit);
                        break;
                    case '-':
                        result.push(UNITS_DASH * unit);
                        break;
                    default:
                        continue;
                }
                result.push(UNITS_BETWEEN_SIGNS * unit);
            }
            result.pop();
            result.push(UNITS_BETWEEN_CHARS * unit);
        }
        result.pop();
        result.push(UNITS_BETWEEN_WORDS * unit);
    }
    result.pop();
    return result;
}

module.exports = { encode, decode, splitPattern, isEncoded, timings };