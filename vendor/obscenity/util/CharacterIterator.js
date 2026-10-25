import { convertSurrogatePairToCodePoint, isHighSurrogate, isLowSurrogate } from './Char.js';
export class CharacterIterator {
    _input;
    lastPosition = -1;
    currentPosition = 0;
    _lastWidth = 0;
    constructor(input){
        this._input = input ?? '';
    }
    get input() {
        return this._input;
    }
    setInput(input) {
        this._input = input;
        this.reset();
        return this;
    }
    reset() {
        this.lastPosition = -1;
        this.currentPosition = 0;
        this._lastWidth = 0;
    }
    next() {
        if (this.done) return {
            done: true,
            value: undefined
        };
        this.lastPosition = this.currentPosition;
        const char = this._input.charCodeAt(this.currentPosition++);
        this._lastWidth = 1;
        if (this.done || !isHighSurrogate(char)) return {
            done: false,
            value: char
        };
        const next = this._input.charCodeAt(this.currentPosition);
        if (isLowSurrogate(next)) {
            this._lastWidth++;
            this.currentPosition++;
            return {
                done: false,
                value: convertSurrogatePairToCodePoint(char, next)
            };
        }
        return {
            done: false,
            value: char
        };
    }
    get position() {
        return this.lastPosition;
    }
    get lastWidth() {
        return this._lastWidth;
    }
    get done() {
        return this.currentPosition >= this._input.length;
    }
    [Symbol.iterator]() {
        return this;
    }
}
