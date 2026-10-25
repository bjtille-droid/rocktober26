import { CharacterCode, convertSurrogatePairToCodePoint, isHighSurrogate, isLowSurrogate } from '../util/Char.js';
import { CharacterIterator } from '../util/CharacterIterator.js';
import { SyntaxKind } from './Nodes.js';
import { ParserError } from './ParserError.js';
const supportsEscaping = [
    CharacterCode.Backslash,
    CharacterCode.LeftSquareBracket,
    CharacterCode.RightSquareBracket,
    CharacterCode.QuestionMark,
    CharacterCode.VerticalBar
];
const supportsEscapingList = supportsEscaping.map((char)=>`'${String.fromCodePoint(char)}'`).join(', ');
const eof = -1;
export class Parser {
    input = '';
    line = 1;
    column = 1;
    position = 0;
    lastColumn = 1;
    lastWidth = 0;
    parse(input) {
        this.setInput(input);
        const nodes = [];
        const firstNode = this.nextNode();
        const requireWordBoundaryAtStart = firstNode?.kind === SyntaxKind.BoundaryAssertion;
        if (firstNode && !requireWordBoundaryAtStart) nodes.push(firstNode);
        let requireWordBoundaryAtEnd = false;
        while(!this.done){
            const pos = this.mark();
            const node = this.nextNode();
            if (node.kind !== SyntaxKind.BoundaryAssertion) {
                nodes.push(node);
                continue;
            }
            if (!this.done) {
                this.reportError('Boundary assertions are not supported in this position; they are only allowed at the start / end of the pattern.', pos);
            }
            requireWordBoundaryAtEnd = true;
        }
        return {
            requireWordBoundaryAtStart,
            requireWordBoundaryAtEnd,
            nodes
        };
    }
    setInput(input) {
        this.input = input;
        this.line = 1;
        this.column = 1;
        this.position = 0;
        this.lastColumn = 1;
        this.lastWidth = 0;
        return this;
    }
    nextNode() {
        switch(this.peek()){
            case eof:
                return undefined;
            case CharacterCode.LeftSquareBracket:
                return this.parseOptional();
            case CharacterCode.RightSquareBracket:
                this.reportError(`Unexpected ']' with no corresponding '['.`);
            case CharacterCode.QuestionMark:
                return this.parseWildcard();
            case CharacterCode.VerticalBar:
                return this.parseBoundaryAssertion();
            default:
                return this.parseLiteral();
        }
    }
    get done() {
        return this.position >= this.input.length;
    }
    parseOptional() {
        const preOpenBracketPos = this.mark();
        this.next();
        const postOpenBracketPos = this.mark();
        if (this.done) this.reportError("Unexpected unclosed '['.", preOpenBracketPos);
        if (this.accept('[')) this.reportError('Unexpected nested optional node.', postOpenBracketPos);
        const childNode = this.nextNode();
        if (childNode.kind === SyntaxKind.BoundaryAssertion) {
            this.reportError('Boundary assertions are not supported in this position; they are only allowed at the start / end of the pattern.', postOpenBracketPos);
        }
        if (!this.accept(']')) this.reportError("Unexpected unclosed '['.");
        return {
            kind: SyntaxKind.Optional,
            childNode: childNode
        };
    }
    parseWildcard() {
        this.next();
        return {
            kind: SyntaxKind.Wildcard
        };
    }
    parseBoundaryAssertion() {
        this.next();
        return {
            kind: SyntaxKind.BoundaryAssertion
        };
    }
    parseLiteral() {
        const chars = [];
        while(!this.done){
            if (this.accept('[]?|')) {
                this.backup();
                break;
            }
            const next = this.next();
            if (next === CharacterCode.Backslash) {
                if (this.done) {
                    this.backup();
                    this.reportError('Unexpected trailing backslash.');
                }
                const escaped = this.next();
                if (!supportsEscaping.includes(escaped)) {
                    const repr = String.fromCodePoint(escaped);
                    this.backup();
                    this.reportError(`Cannot escape character '${repr}'; the only characters that can be escaped are the following: ${supportsEscapingList}.`);
                }
                chars.push(escaped);
            } else {
                chars.push(next);
            }
        }
        return {
            kind: SyntaxKind.Literal,
            chars
        };
    }
    reportError(message, { line = this.line, column = this.column } = {}) {
        throw new ParserError(message, line, column);
    }
    mark() {
        return {
            line: this.line,
            column: this.column
        };
    }
    accept(charset) {
        const next = this.next();
        const iter = new CharacterIterator(charset);
        for (const char of iter){
            if (char === next) return true;
        }
        this.backup();
        return false;
    }
    peek() {
        const next = this.next();
        this.backup();
        return next;
    }
    next() {
        if (this.done) return eof;
        const char = this.input.charCodeAt(this.position++);
        this.lastWidth = 1;
        if (char === CharacterCode.Newline) {
            this.lastColumn = this.column;
            this.column = 1;
            this.line++;
            return char;
        }
        this.lastColumn = this.column++;
        if (!isHighSurrogate(char) || this.done) return char;
        const next = this.input.charCodeAt(this.position);
        if (isLowSurrogate(next)) {
            this.position++;
            this.lastWidth++;
            return convertSurrogatePairToCodePoint(char, next);
        }
        return char;
    }
    backup() {
        this.position -= this.lastWidth;
        this.column = this.lastColumn;
        if (this.lastWidth === 1 && this.input.charCodeAt(this.position) === CharacterCode.Newline) {
            this.line--;
        }
    }
}
