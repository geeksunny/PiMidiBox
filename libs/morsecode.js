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

module.exports = {
    /**
     * Encode a string as a Morse code pattern.
     * @param {string} s - The string to encode.
     * @param {"/"|"|"|""|ArrayConstructor} [separator='/'] - Character used to separate completed word sequences.
     * @returns {string|Array} - todo
     */
    encode: (s, separator = '/') => {
        if (s === undefined) {
            throw new ReferenceError('No string provided to be encoded.');
        } else if (typeof s !== 'string') {
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
    },
    /**
     * Decode one or more Morse code patterns.
     * @param {string|string[]} s - A string or array of strings to be decoded.
     * @param {string} [separator] - Symbol used to separate word sequences if `s` is a {string}.
     *      If no value is passed, the default '/' and '|' will be used.
     * @returns {string}
     */
    decode: (s, separator) => {
        let words;
        if (Array.isArray(s)) {
            words = s;
        } else {
            let _separator = (typeof separator === 'string' && !!separator.length)
                ? /\s*[/|]\s*/
                : new RegExp(`\s*[${tools.escapeRegExp(separator)}]\s*`);
            words = s.split(_separator);
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
};