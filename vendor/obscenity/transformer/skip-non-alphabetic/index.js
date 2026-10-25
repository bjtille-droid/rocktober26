import { isAlphabetic } from '../../util/Char.js';
import { createSimpleTransformer } from '../Transformers.js';
export function skipNonAlphabeticTransformer() {
    return createSimpleTransformer((c)=>isAlphabetic(c) ? c : undefined);
}
