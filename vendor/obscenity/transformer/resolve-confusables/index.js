import { remapCharactersTransformer } from '../remap-characters/index.js';
import { confusables } from './confusables.js';
export function resolveConfusablesTransformer() {
    return remapCharactersTransformer(confusables);
}
