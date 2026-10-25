import { getAndAssertSingleCodePoint } from '../../util/Char.js';
import { CharacterIterator } from '../../util/CharacterIterator.js';
import { createSimpleTransformer } from '../Transformers.js';
export function remapCharactersTransformer(mapping) {
    const map = createOneToOneMap(mapping);
    return createSimpleTransformer((c)=>map.get(c) ?? c);
}
function createOneToOneMap(mapping) {
    const map = new Map();
    const iterable = mapping instanceof Map ? mapping.entries() : Object.entries(mapping);
    for (const [original, equivalents] of iterable){
        const originalChar = getAndAssertSingleCodePoint(original);
        const iter = new CharacterIterator(equivalents);
        for (const equivalent of iter)map.set(equivalent, originalChar);
    }
    return map;
}
