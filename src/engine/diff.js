// Line-level diff between two spec revisions + allergen profile delta.

const lines = (t) => t.split(/\r?\n|(?<=[.;])\s+/).map((s) => s.trim()).filter(Boolean);

/** @returns {{added:string[], removed:string[]}} */
export function textDiff(oldText, newText) {
  const a = new Set(lines(oldText));
  const b = new Set(lines(newText));
  return { added: [...b].filter((x) => !a.has(x)), removed: [...a].filter((x) => !b.has(x)) };
}

/**
 * @param {import("../schemas.js").SpecProfile} oldP
 * @param {import("../schemas.js").SpecProfile} newP
 */
export function profileDelta(oldP, newP) {
  const diff = (x, y) => [...y].filter((a) => !x.has(a));
  return {
    newlyContains: diff(oldP.contains, newP.contains),
    noLongerContains: diff(newP.contains, oldP.contains),
    newlyMayContain: diff(oldP.mayContain, newP.mayContain),
    newUnresolved: newP.unresolved.filter((u) => !oldP.unresolved.includes(u)),
  };
}
