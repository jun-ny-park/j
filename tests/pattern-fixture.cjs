// Isolate the existing basic recipe when a legacy test compares exact geometry.
// The new selector and all five patterns are exercised in safe-patterns.cjs.
exports.basic = source => source.replace('    const selection = selectPattern(level);',
 `    const selection = {id:'basic',recipe:level.recipes[patternIndex % level.recipes.length],obstacles:level.recipes[patternIndex % level.recipes.length].map(()=>true)};`);
