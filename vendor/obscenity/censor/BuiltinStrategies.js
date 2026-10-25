import { getAndAssertSingleCodePoint } from '../util/Char.js';
export function keepStartCensorStrategy(baseStrategy) {
    return (ctx)=>{
        if (ctx.overlapsAtStart) return baseStrategy(ctx);
        const firstChar = String.fromCodePoint(ctx.input.codePointAt(ctx.startIndex));
        return firstChar + baseStrategy({
            ...ctx,
            matchLength: ctx.matchLength - 1
        });
    };
}
export function keepEndCensorStrategy(baseStrategy) {
    return (ctx)=>{
        if (ctx.overlapsAtEnd) return baseStrategy(ctx);
        const lastChar = String.fromCodePoint(ctx.input.codePointAt(ctx.endIndex));
        return baseStrategy({
            ...ctx,
            matchLength: ctx.matchLength - 1
        }) + lastChar;
    };
}
export function asteriskCensorStrategy() {
    return fixedCharCensorStrategy('*');
}
export function grawlixCensorStrategy() {
    return randomCharFromSetCensorStrategy('%@$&*');
}
export function fixedPhraseCensorStrategy(phrase) {
    return ()=>phrase;
}
export function fixedCharCensorStrategy(char) {
    getAndAssertSingleCodePoint(char);
    return (ctx)=>char.repeat(ctx.matchLength);
}
export function randomCharFromSetCensorStrategy(charset) {
    const chars = [
        ...charset
    ];
    if (chars.length < 2) throw new Error('The character set passed must have at least 2 characters.');
    return (ctx)=>{
        if (ctx.matchLength === 0) return '';
        let lastIdx = Math.floor(Math.random() * chars.length);
        let censored = chars[lastIdx];
        for(let i = 1; i < ctx.matchLength; i++){
            let idx = Math.floor(Math.random() * (chars.length - 1));
            if (idx >= lastIdx) idx++;
            lastIdx = idx;
            censored += chars[idx];
        }
        return censored;
    };
}
