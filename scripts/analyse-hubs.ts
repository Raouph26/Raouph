import { classicLevel, dailyLevel, todayKey } from "../src/core/chapters";
import { solve } from "../src/core/solver";
import type { Level, ShapeId } from "../src/core/types";

/** How many distinct colours actually cross each hub in a level's solution. */
function hubColourCounts(level: Level): number[] {
  const [solution] = solve(level, { limit: 1 }).solutions;
  if (!solution) return [];
  const perHub = new Map<number, Set<ShapeId>>();
  for (const [shape, path] of solution as Map<ShapeId, number[]>) {
    for (const cell of path) {
      if (level.cells[cell].kind !== "hub") continue;
      if (!perHub.has(cell)) perHub.set(cell, new Set());
      perHub.get(cell)!.add(shape);
    }
  }
  return [...perHub.values()].map((s) => s.size);
}

let totalHubs = 0;
const byColours = [0, 0, 0, 0];
let levelsWithTriple = 0;
let levelsChecked = 0;

const RANGE_START = Number(process.env.FROM ?? 6);
for (let chapter = RANGE_START; chapter <= 20; chapter++) {
  for (let stage = 1; stage <= 32; stage += 3) {
    const counts = hubColourCounts(classicLevel(chapter, stage));
    levelsChecked++;
    let triple = false;
    for (const c of counts) {
      totalHubs++;
      byColours[Math.min(3, c)]++;
      if (c >= 3) triple = true;
    }
    if (triple) levelsWithTriple++;
  }
}
const day = todayKey();
for (let stage = 1; stage <= 32; stage += 3) {
  const counts = hubColourCounts(dailyLevel(day, stage));
  levelsChecked++;
  let triple = false;
  for (const c of counts) {
    totalHubs++;
    byColours[Math.min(3, c)]++;
    if (c >= 3) triple = true;
  }
  if (triple) levelsWithTriple++;
}

console.log(`levels checked (3-colour chapters): ${levelsChecked}`);
console.log(`hubs total: ${totalHubs}`);
console.log(`  crossed by 1 colour : ${byColours[1]}`);
console.log(`  crossed by 2 colours: ${byColours[2]}`);
console.log(`  crossed by 3 colours: ${byColours[3]}`);
console.log(`levels containing a 3-colour hub: ${levelsWithTriple} / ${levelsChecked}`);
