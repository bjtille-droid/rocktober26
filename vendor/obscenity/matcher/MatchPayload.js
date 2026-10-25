import { compareIntervals } from '../util/Interval.js';
export function compareMatchByPositionAndId(a, b) {
    const result = compareIntervals(a.startIndex, a.endIndex, b.startIndex, b.endIndex);
    if (result !== 0) return result;
    return a.termId === b.termId ? 0 : a.termId < b.termId ? -1 : 1;
}
