export var CharacterCode = /*#__PURE__*/ function(CharacterCode) {
    CharacterCode[CharacterCode["LowerA"] = 97] = "LowerA";
    CharacterCode[CharacterCode["LowerZ"] = 122] = "LowerZ";
    CharacterCode[CharacterCode["UpperA"] = 65] = "UpperA";
    CharacterCode[CharacterCode["UpperZ"] = 90] = "UpperZ";
    CharacterCode[CharacterCode["Zero"] = 48] = "Zero";
    CharacterCode[CharacterCode["Nine"] = 57] = "Nine";
    CharacterCode[CharacterCode["LeftSquareBracket"] = 91] = "LeftSquareBracket";
    CharacterCode[CharacterCode["RightSquareBracket"] = 93] = "RightSquareBracket";
    CharacterCode[CharacterCode["QuestionMark"] = 63] = "QuestionMark";
    CharacterCode[CharacterCode["Backslash"] = 92] = "Backslash";
    CharacterCode[CharacterCode["Newline"] = 10] = "Newline";
    CharacterCode[CharacterCode["VerticalBar"] = 124] = "VerticalBar";
    CharacterCode[CharacterCode["HighSurrogateStart"] = 55296] = "HighSurrogateStart";
    CharacterCode[CharacterCode["HighSurrogateEnd"] = 56319] = "HighSurrogateEnd";
    CharacterCode[CharacterCode["LowSurrogateStart"] = 56320] = "LowSurrogateStart";
    CharacterCode[CharacterCode["LowSurrogateEnd"] = 57343] = "LowSurrogateEnd";
    return CharacterCode;
}({});
export function isHighSurrogate(char) {
    return 55296 <= char && char <= 56319;
}
export function isLowSurrogate(char) {
    return 56320 <= char && char <= 57343;
}
export function convertSurrogatePairToCodePoint(highSurrogate, lowSurrogate) {
    return (highSurrogate - 55296) * 0x400 + lowSurrogate - 56320 + 0x10000;
}
export function isWordChar(char) {
    return isDigit(char) || isAlphabetic(char);
}
export function isDigit(char) {
    return 48 <= char && char <= 57;
}
export function isAlphabetic(char) {
    return isLowerCase(char) || isUpperCase(char);
}
export function isLowerCase(char) {
    return 97 <= char && char <= 122;
}
export function isUpperCase(char) {
    return 65 <= char && char <= 90;
}
export function invertCaseOfAlphabeticChar(char) {
    return char ^ 0x20;
}
export function getAndAssertSingleCodePoint(str) {
    if ([
        ...str
    ].length !== 1) throw new RangeError(`Expected the input string to be one code point in length.`);
    return str.codePointAt(0);
}
