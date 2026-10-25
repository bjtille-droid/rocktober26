import { compilePatternToRegExp, potentiallyMatchesEmptyString } from '../../pattern/Util.js';
import { TransformerSet } from '../../transformer/TransformerSet.js';
import { isHighSurrogate, isLowSurrogate } from '../../util/Char.js';
import { CharacterIterator } from '../../util/CharacterIterator.js';
import { IntervalCollection } from '../IntervalCollection.js';
import { compareMatchByPositionAndId } from '../MatchPayload.js';
export class RegExpMatcher {
    blacklistedTerms;
    whitelistedTerms;
    blacklistMatcherTransformers;
    whitelistMatcherTransformers;
    constructor({ blacklistedTerms, whitelistedTerms = [], blacklistMatcherTransformers = [], whitelistMatcherTransformers = [] }){
        this.blacklistedTerms = this.compileTerms(blacklistedTerms);
        this.validateWhitelistedTerms(whitelistedTerms);
        this.whitelistedTerms = whitelistedTerms;
        this.blacklistMatcherTransformers = new TransformerSet(blacklistMatcherTransformers);
        this.whitelistMatcherTransformers = new TransformerSet(whitelistMatcherTransformers);
    }
    getAllMatches(input, sorted = false) {
        const whitelistedIntervals = this.getWhitelistedIntervals(input);
        const [transformedToOrigIndex, transformed] = this.applyTransformers(input, this.blacklistMatcherTransformers);
        const matches = [];
        for (const blacklistedTerm of this.blacklistedTerms){
            for (const match of transformed.matchAll(blacklistedTerm.regExp)){
                const origStartIndex = transformedToOrigIndex[match.index];
                let origEndIndex = transformedToOrigIndex[match.index + match[0].length - 1];
                if (origEndIndex < input.length - 1 && isHighSurrogate(input.charCodeAt(origEndIndex)) && isLowSurrogate(input.charCodeAt(origEndIndex + 1))) {
                    origEndIndex++;
                }
                if (!whitelistedIntervals.query(origStartIndex, origEndIndex)) {
                    matches.push({
                        termId: blacklistedTerm.id,
                        startIndex: origStartIndex,
                        endIndex: origEndIndex,
                        matchLength: [
                            ...match[0]
                        ].length
                    });
                }
            }
        }
        if (sorted) matches.sort(compareMatchByPositionAndId);
        return matches;
    }
    hasMatch(input) {
        const whitelistedIntervals = this.getWhitelistedIntervals(input);
        const [transformedToOrigIndex, transformed] = this.applyTransformers(input, this.blacklistMatcherTransformers);
        for (const blacklistedTerm of this.blacklistedTerms){
            for (const match of transformed.matchAll(blacklistedTerm.regExp)){
                const origStartIndex = transformedToOrigIndex[match.index];
                let origEndIndex = transformedToOrigIndex[match.index + match[0].length - 1];
                if (origEndIndex < input.length - 1 && isHighSurrogate(input.charCodeAt(origEndIndex)) && isLowSurrogate(input.charCodeAt(origEndIndex + 1))) {
                    origEndIndex++;
                }
                if (!whitelistedIntervals.query(origStartIndex, origEndIndex)) return true;
            }
        }
        return false;
    }
    getWhitelistedIntervals(input) {
        const matches = new IntervalCollection();
        const [transformedToOrigIndex, transformed] = this.applyTransformers(input, this.whitelistMatcherTransformers);
        for (const whitelistedTerm of this.whitelistedTerms){
            let lastEnd = 0;
            for(let startIndex = transformed.indexOf(whitelistedTerm, lastEnd); startIndex !== -1; startIndex = transformed.indexOf(whitelistedTerm, lastEnd)){
                let origEndIndex = transformedToOrigIndex[startIndex + whitelistedTerm.length - 1];
                if (origEndIndex < input.length - 1 && isHighSurrogate(input.charCodeAt(origEndIndex)) && isLowSurrogate(input.charCodeAt(origEndIndex + 1))) {
                    origEndIndex++;
                }
                matches.insert(transformedToOrigIndex[startIndex], origEndIndex);
                lastEnd = startIndex + whitelistedTerm.length;
            }
        }
        return matches;
    }
    applyTransformers(input, transformers) {
        const transformedToOrigIndex = [];
        let transformed = '';
        const iter = new CharacterIterator(input);
        for (const char of iter){
            const transformedChar = transformers.applyTo(char);
            if (transformedChar !== undefined) {
                transformed += String.fromCodePoint(transformedChar);
                while(transformedToOrigIndex.length < transformed.length)transformedToOrigIndex.push(iter.position);
            }
        }
        transformers.resetAll();
        return [
            transformedToOrigIndex,
            transformed
        ];
    }
    compileTerms(terms) {
        const compiled = [];
        const seenIds = new Set();
        for (const term of terms){
            if (seenIds.has(term.id)) throw new Error(`Duplicate blacklisted term ID ${term.id}.`);
            if (potentiallyMatchesEmptyString(term.pattern)) {
                throw new Error(`Pattern with ID ${term.id} potentially matches empty string; this is unsupported.`);
            }
            compiled.push({
                id: term.id,
                regExp: compilePatternToRegExp(term.pattern)
            });
            seenIds.add(term.id);
        }
        return compiled;
    }
    validateWhitelistedTerms(whitelist) {
        if (whitelist.some((term)=>term.length === 0)) {
            throw new Error('Whitelisted term set contains empty string; this is unsupported.');
        }
    }
}
