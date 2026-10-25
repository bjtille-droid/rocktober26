import { remapCharactersTransformer } from '../remap-characters/index.js';
import { dictionary } from './dictionary.js';
export function resolveLeetSpeakTransformer() {
    return remapCharactersTransformer(dictionary);
}
