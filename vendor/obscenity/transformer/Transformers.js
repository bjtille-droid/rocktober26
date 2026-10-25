export var TransformerType = /*#__PURE__*/ function(TransformerType) {
    TransformerType[TransformerType["Simple"] = 0] = "Simple";
    TransformerType[TransformerType["Stateful"] = 1] = "Stateful";
    return TransformerType;
}({});
export function createSimpleTransformer(transformer) {
    return {
        type: 0,
        transform: transformer
    };
}
export function createStatefulTransformer(factory) {
    return {
        type: 1,
        factory
    };
}
