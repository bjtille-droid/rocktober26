import { TransformerType } from './Transformers.js';
export class TransformerSet {
    transformers;
    statefulTransformers;
    constructor(transformers){
        this.transformers = transformers;
        this.statefulTransformers = Array.from({
            length: this.transformers.length
        });
        for(let i = 0; i < this.transformers.length; i++){
            const transformer = this.transformers[i];
            if (transformer.type === TransformerType.Stateful) {
                this.statefulTransformers[i] = transformer.factory();
            }
        }
    }
    applyTo(char) {
        let transformed = char;
        for(let i = 0; i < this.transformers.length && transformed !== undefined; i++){
            const transformer = this.transformers[i];
            if (transformer.type === TransformerType.Simple) transformed = transformer.transform(transformed);
            else transformed = this.statefulTransformers[i].transform(transformed);
        }
        return transformed;
    }
    resetAll() {
        for(let i = 0; i < this.transformers.length; i++){
            if (this.transformers[i].type === TransformerType.Stateful) {
                this.statefulTransformers[i].reset();
            }
        }
    }
}
