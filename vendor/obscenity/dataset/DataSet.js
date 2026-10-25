import { assignIncrementingIds } from '../matcher/BlacklistedTerm.js';
export class DataSet {
    containers = [];
    patternCount = 0;
    patternIdToPhraseContainer = new Map();
    addAll(other) {
        for (const container of other.containers)this.registerContainer(container);
        return this;
    }
    removePhrasesIf(predicate) {
        this.patternCount = 0;
        this.patternIdToPhraseContainer.clear();
        const containers = this.containers.splice(0);
        for (const container of containers){
            const remove = predicate(container);
            if (!remove) this.registerContainer(container);
        }
        return this;
    }
    addPhrase(fn) {
        const container = fn(new PhraseBuilder()).build();
        this.registerContainer(container);
        return this;
    }
    getPayloadWithPhraseMetadata(payload) {
        const offset = this.patternIdToPhraseContainer.get(payload.termId);
        if (offset === undefined) {
            throw new Error(`The pattern with ID ${payload.termId} does not exist in this dataset.`);
        }
        return {
            ...payload,
            phraseMetadata: this.containers[offset].metadata
        };
    }
    build() {
        return {
            blacklistedTerms: assignIncrementingIds(this.containers.flatMap((p)=>p.patterns)),
            whitelistedTerms: this.containers.flatMap((p)=>p.whitelistedTerms)
        };
    }
    registerContainer(container) {
        const offset = this.containers.push(container) - 1;
        for(let i = 0, phraseId = this.patternCount; i < container.patterns.length; i++, phraseId++){
            this.patternIdToPhraseContainer.set(phraseId, offset);
            this.patternCount++;
        }
    }
}
export class PhraseBuilder {
    patterns = [];
    whitelistedTerms = [];
    metadata;
    addPattern(pattern) {
        this.patterns.push(pattern);
        return this;
    }
    addWhitelistedTerm(term) {
        this.whitelistedTerms.push(term);
        return this;
    }
    setMetadata(metadata) {
        this.metadata = metadata;
        return this;
    }
    build() {
        return {
            patterns: this.patterns,
            whitelistedTerms: this.whitelistedTerms,
            metadata: this.metadata
        };
    }
}
