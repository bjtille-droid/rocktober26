import { compareMatchByPositionAndId } from '../matcher/MatchPayload.js';
import { grawlixCensorStrategy } from './BuiltinStrategies.js';
export class TextCensor {
    strategy = grawlixCensorStrategy();
    setStrategy(strategy) {
        this.strategy = strategy;
        return this;
    }
    applyTo(input, matches) {
        if (matches.length === 0) return input;
        const sorted = [
            ...matches
        ].sort(compareMatchByPositionAndId);
        let censored = '';
        let lastIndex = 0;
        for(let i = 0; i < sorted.length; i++){
            const match = sorted[i];
            if (lastIndex > match.endIndex) continue;
            const overlapsAtStart = match.startIndex < lastIndex;
            if (!overlapsAtStart) censored += input.slice(lastIndex, match.startIndex);
            const actualStartIndex = Math.max(lastIndex, match.startIndex);
            const overlapsAtEnd = i < sorted.length - 1 && match.endIndex >= sorted[i + 1].startIndex && match.endIndex < sorted[i + 1].endIndex;
            censored += this.strategy({
                ...match,
                startIndex: actualStartIndex,
                input,
                overlapsAtStart,
                overlapsAtEnd
            });
            lastIndex = match.endIndex + 1;
        }
        censored += input.slice(lastIndex);
        return censored;
    }
}
