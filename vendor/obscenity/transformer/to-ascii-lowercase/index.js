import { invertCaseOfAlphabeticChar, isUpperCase } from '../../util/Char.js';
import { createSimpleTransformer } from '../Transformers.js';
export function toAsciiLowerCaseTransformer() {
    return createSimpleTransformer((c)=>isUpperCase(c) ? invertCaseOfAlphabeticChar(c) : c);
}
