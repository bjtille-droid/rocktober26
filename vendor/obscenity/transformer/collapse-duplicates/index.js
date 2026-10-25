import { getAndAssertSingleCodePoint } from '../../util/Char.js';
import { createStatefulTransformer } from '../Transformers.js';
import { CollapseDuplicatesTransformer } from './transformer.js';
export function collapseDuplicatesTransformer({ defaultThreshold = 1, customThresholds = new Map() } = {}) {
    const map = createCharacterToThresholdMap(customThresholds);
    return createStatefulTransformer(()=>new CollapseDuplicatesTransformer({
            defaultThreshold,
            customThresholds: map
        }));
}
function createCharacterToThresholdMap(customThresholds) {
    const map = new Map();
    for (const [str, threshold] of customThresholds){
        if (threshold < 0) throw new RangeError('Expected all thresholds to be non-negative.');
        const char = getAndAssertSingleCodePoint(str);
        map.set(char, threshold);
    }
    return map;
}
