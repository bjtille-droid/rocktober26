export function assignIncrementingIds(patterns) {
    let currentId = 0;
    return patterns.map((pattern)=>({
            id: currentId++,
            pattern
        }));
}
