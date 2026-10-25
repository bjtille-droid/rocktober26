export class IntervalCollection {
    dirty = false;
    intervals = [];
    insert(lowerBound, upperBound) {
        this.intervals.push([
            lowerBound,
            upperBound
        ]);
        this.dirty = true;
    }
    query(lowerBound, upperBound) {
        if (this.intervals.length === 0) return false;
        if (this.dirty) {
            this.dirty = false;
            this.intervals.sort((a, b)=>a[0] < b[0] ? -1 : b[0] < a[0] ? 1 : 0);
        }
        for (const interval of this.intervals){
            if (interval[0] > lowerBound) break;
            if (interval[0] <= lowerBound && upperBound <= interval[1]) return true;
        }
        return false;
    }
    values() {
        return this.intervals.values();
    }
    [Symbol.iterator]() {
        return this.values();
    }
}
