import { Parser } from './Parser.js';
const parser = new Parser();
export function pattern(strings, ...expressions) {
    let result = strings.raw[0];
    for (const [i, expression] of expressions.entries()){
        result += String(expression);
        result += strings.raw[i + 1];
    }
    return parser.parse(result);
}
export function parseRawPattern(pattern) {
    return parser.parse(pattern);
}
