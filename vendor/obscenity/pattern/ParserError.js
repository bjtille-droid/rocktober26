export class ParserError extends Error {
    name = 'ParserError';
    line;
    column;
    constructor(message, line, column){
        super(`${line}:${column}: ${message}`);
        this.line = line;
        this.column = column;
    }
}
