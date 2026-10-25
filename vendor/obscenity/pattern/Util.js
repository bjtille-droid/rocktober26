import { SyntaxKind } from './Nodes.js';
export function potentiallyMatchesEmptyString(pattern) {
    return pattern.nodes.every((node)=>node.kind === SyntaxKind.Optional);
}
export function compilePatternToRegExp(pattern) {
    let regExpStr = '';
    if (pattern.requireWordBoundaryAtStart) regExpStr += '\\b';
    for (const node of pattern.nodes)regExpStr += getRegExpStringForNode(node);
    if (pattern.requireWordBoundaryAtEnd) regExpStr += `\\b`;
    return new RegExp(regExpStr, 'gs');
}
const regExpSpecialChars = [
    '[',
    '.',
    '*',
    '+',
    '?',
    '^',
    '$',
    '{',
    '}',
    '(',
    ')',
    '|',
    '[',
    '\\',
    ']'
].map((str)=>str.charCodeAt(0));
export function getRegExpStringForNode(node) {
    switch(node.kind){
        case SyntaxKind.Literal:
            {
                let str = '';
                for (const char of node.chars){
                    if (regExpSpecialChars.includes(char)) str += '\\';
                    str += String.fromCodePoint(char);
                }
                return str;
            }
        case SyntaxKind.Optional:
            return `(?:${getRegExpStringForNode(node.childNode)})?`;
        case SyntaxKind.Wildcard:
            return `.`;
    }
}
