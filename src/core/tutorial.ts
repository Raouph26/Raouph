import { parseLevel } from "./level";
import type { Level } from "./types";

/**
 * The opening of chapter 1, authored rather than generated.
 *
 * The generator makes interesting boards but not *teaching* ones — it has no
 * concept of introducing an idea in isolation. These twelve each add exactly
 * one thing, and every board is verified to have a single solution.
 *
 * Watch for dead ends when editing: a piece whose only neighbour is a hub can
 * never be visited, since reaching and leaving it would reuse one segment.
 */
const BOARDS: string[][] = [
  // 1. Drag from one haloed piece to the other, through everything between.
  ["Aaa", "..A"],
  // 2. Diagonals count as touching.
  ["A..", ".a.", "..A"],
  // 3. A line can turn.
  ["Aa.", ".a.", ".aA"],
  // 4. Every piece must be used — the direct route is not the answer.
  ["aa.", ".Aa", "Aaa"],
  // 5. The same idea with more room to go wrong.
  ["A..", "a.a", "aAa", "aaa"],
  // 6. A second colour. Two separate puzzles side by side.
  ["A.B", "a.b", "a.b", "A.B"],
  // 7. Now the colours are interleaved, so each line has to stay out of the
  //    other's pieces.
  [".aA", "aaA", "B..", "Bb."],
  // 8. Denser, with both lines competing for the same space.
  ["aa.", "aAb", "aBb", ".AB"],
  // 9. A hub. The arcs say how many passes must cross it — here, one each.
  ["A.B", ".2.", "B.A"],
  // 10. A hub inside a real board.
  ["abB", "Aa2", ".aB", ".A."],
  // 11. More board, one hub.
  [".a.", "aaA", "a.2", "ABb", "Bbb"],
  // 12. Two hubs at once.
  ["bBb", "22a", "Aba", "baA", "B.a"],
];

export const TUTORIAL_LEVELS: Level[] = BOARDS.map((rows, i) =>
  parseLevel(`c1-s${i + 1}`, rows),
);

export const TUTORIAL_STAGES = TUTORIAL_LEVELS.length;
