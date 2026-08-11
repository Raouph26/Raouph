import type { Paths } from "./rules";
import { solve } from "./solver";
import type { CellIndex, Level, ShapeId } from "./types";

export interface Hint {
  shape: ShapeId;
  from: CellIndex;
  to: CellIndex;
}

/** Solutions are expensive on the largest boards and never change. */
const solutions = new Map<string, Paths | null>();

function solutionFor(level: Level): Paths | null {
  const cached = solutions.get(level.id);
  if (cached !== undefined) return cached;
  const [found] = solve(level, { limit: 1 }).solutions;
  solutions.set(level.id, found ?? null);
  return found ?? null;
}

/**
 * The single most useful next move: one correct segment the player has not yet
 * drawn, taken from the line they have made least progress on.
 *
 * Deliberately one segment rather than a whole line. A hint that solves the
 * puzzle removes the reason to be playing; this one unsticks a player and hands
 * the puzzle straight back.
 */
export function nextHint(level: Level, paths: Paths): Hint | null {
  const solution = solutionFor(level);
  if (!solution) return null;

  let best: Hint | null = null;
  let bestProgress = Infinity;

  for (const [shape, answer] of solution) {
    const drawn = paths.get(shape) ?? [];

    // Walk the answer from its start and find where the player diverges. The
    // answer is canonical, so compare against the player's line in whichever
    // direction they happened to draw it.
    const reversed = drawn.length > 1 && drawn[0] === answer[answer.length - 1];
    const compare = reversed ? [...drawn].reverse() : drawn;

    let matched = 0;
    while (
      matched < compare.length &&
      matched < answer.length &&
      compare[matched] === answer[matched]
    ) {
      matched++;
    }
    if (matched >= answer.length) continue;

    // A line that has gone wrong is hinted from its last correct cell.
    const from = matched === 0 ? answer[0] : answer[matched - 1];
    const to = answer[matched === 0 ? 1 : matched];
    if (to === undefined) continue;

    const progress = matched / answer.length;
    if (progress < bestProgress) {
      bestProgress = progress;
      best = { shape, from, to };
    }
  }
  return best;
}
