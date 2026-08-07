import { parseLevel } from "../core/level";
import type { Level } from "../core/types";

/**
 * Hand-authored opening levels. These exist to teach one idea at a time — the
 * generator makes interesting boards but not gentle ones.
 *
 * Watch for dead ends when editing: a node whose only neighbour is a hub can
 * never be visited, because reaching it and leaving it would reuse the same
 * segment. The level tests catch this, but it is easy to author by accident.
 */
export const TUTORIAL_LEVELS: Level[] = [
  // Drag from one terminal to the other, passing through every node.
  parseLevel("1-1", [
    "Aaa",
    "..a",
    "..A",
  ]),
  // Diagonal moves are legal.
  parseLevel("1-2", [
    "A...",
    ".aa.",
    "..a.",
    "...A",
  ]),
  // Two lines that never touch: each colour is its own puzzle.
  parseLevel("1-3", [
    "A.B",
    "a.b",
    "a.b",
    "A.B",
  ]),
  // A hub. The 2 means exactly two passes must cross it — here, one per line.
  parseLevel("1-4", [
    "A.B",
    ".2.",
    "B.A",
  ]),
];
