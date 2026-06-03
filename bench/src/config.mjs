// Benchmark configuration: the cell sweep and measurement constants.

export const REPS_EVAL = 7; // measured cold-start reps per entry (median of these)
export const WARMUP = 2; // discarded warmup reps
export const SAMPLE = 8; // function entries measured per cell (all are identical)

export const cellId = (c) =>
  `${c.version}-G${c.G}-F${c.F}-T${c.T}-${c.complexity}`;

const VERSIONS = ["vanilla", "confect"];
const F = 8; // functions per group, held fixed

// Three orthogonal axes, each isolating one dimension of "project size":
//   A) groups   — does per-function cost grow with the number of function groups?
//   B) tables   — does it grow with schema (table) count?
//   C) shape    — does it grow with Effect-schema complexity?
// The shared cell (G5, T5, medium) is de-duplicated across axes.
const cells = () => {
  const out = [];
  for (const version of VERSIONS) {
    for (const G of [1, 5, 20, 50]) {
      out.push({ version, G, F, T: 5, complexity: "medium" });
    }
    for (const T of [1, 5, 20, 50]) {
      out.push({ version, G: 5, F, T, complexity: "medium" });
    }
    for (const complexity of ["small", "medium", "large"]) {
      out.push({ version, G: 5, F, T: 5, complexity });
    }
  }
  // de-dupe by cellId
  const seen = new Set();
  return out.filter((c) => {
    const id = cellId(c);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

export const SWEEP = cells();
