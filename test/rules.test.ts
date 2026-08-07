import { describe, expect, it } from "vitest";
import { parseLevel } from "../src/core/level";
import { Game } from "../src/core/game";
import { indexOf } from "../src/core/types";
import { canExtend, crossingSegment, segKey } from "../src/core/rules";

/** Drag a line through a list of (x, y) cells, returning the effects. */
function play(game: Game, cells: [number, number][]): string[] {
  const effects: string[] = [];
  const [first, ...rest] = cells;
  effects.push(game.beginAt(indexOf(game.level, first[0], first[1])));
  for (const [x, y] of rest) {
    effects.push(game.dragTo(indexOf(game.level, x, y)));
  }
  game.release();
  return effects;
}

describe("geometry", () => {
  const level = parseLevel("g", ["Aa", "aA"]);

  it("hashes a segment the same in both directions", () => {
    expect(segKey(0, 3)).toBe(segKey(3, 0));
  });

  it("reports the twin of a diagonal", () => {
    // (0,0)-(1,1) is crossed by (1,0)-(0,1).
    expect(crossingSegment(level, 0, 3)).toBe(segKey(1, 2));
  });

  it("reports no twin for an orthogonal move", () => {
    expect(crossingSegment(level, 0, 1)).toBeNull();
  });
});

describe("drawing a line", () => {
  it("solves a simple board and reports it solved", () => {
    const game = new Game(parseLevel("t", ["Aaa", "..a", "..A"]));
    expect(game.solved).toBe(false);
    play(game, [
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
      [2, 2],
    ]);
    expect(game.solved).toBe(true);
  });

  it("is not solved when a node is skipped", () => {
    const game = new Game(parseLevel("t", ["Aaa", "..a", "..A"]));
    // Cut the corner diagonally, missing the node at (2,0).
    play(game, [
      [0, 0],
      [1, 0],
      [2, 1],
      [2, 2],
    ]);
    expect(game.solved).toBe(false);
  });

  it("refuses to enter another shape's node", () => {
    const game = new Game(parseLevel("t", ["AaB", "..a", "B.A"]));
    game.beginAt(indexOf(game.level, 0, 0));
    expect(game.dragTo(indexOf(game.level, 1, 0))).toBe("extend");
    // (2,0) is the other line's terminal, so this line may not enter it.
    expect(game.dragTo(indexOf(game.level, 2, 0))).toBe("none");
  });

  it("refuses to visit a node of its own shape twice", () => {
    const game = new Game(parseLevel("t", ["Aaa", "..a", "..A"]));
    play(game, [
      [0, 0],
      [1, 0],
      [2, 0],
    ]);
    game.beginAt(indexOf(game.level, 2, 0));
    expect(game.dragTo(indexOf(game.level, 1, 0))).toBe("retract");
  });

  it("retracts when dragged back over the previous cell", () => {
    const game = new Game(parseLevel("t", ["Aaa", "..a", "..A"]));
    game.beginAt(indexOf(game.level, 0, 0));
    game.dragTo(indexOf(game.level, 1, 0));
    game.dragTo(indexOf(game.level, 2, 0));
    expect(game.pathFor(0)).toHaveLength(3);
    expect(game.dragTo(indexOf(game.level, 1, 0))).toBe("retract");
    expect(game.pathFor(0)).toHaveLength(2);
  });

  it("truncates when a mid-path node is grabbed", () => {
    const game = new Game(parseLevel("t", ["Aaa", "..a", "..A"]));
    play(game, [
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
    ]);
    expect(game.pathFor(0)).toHaveLength(4);
    expect(game.beginAt(indexOf(game.level, 1, 0))).toBe("truncate");
    expect(game.pathFor(0)).toHaveLength(2);
  });

  it("cannot be extended past a terminal", () => {
    const game = new Game(parseLevel("t", ["Aaa", "..a", "..A"]));
    play(game, [
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
      [2, 2],
    ]);
    game.activeShape = 0;
    expect(game.dragTo(indexOf(game.level, 2, 1))).toBe("retract");
  });
});

describe("hubs", () => {
  const board = ["A.B", ".2.", "B.A"];

  it("lets two different lines cross at a hub", () => {
    const game = new Game(parseLevel("h", board));
    play(game, [
      [0, 0],
      [1, 1],
      [2, 2],
    ]);
    play(game, [
      [2, 0],
      [1, 1],
      [0, 2],
    ]);
    expect(game.solved).toBe(true);
  });

  it("blocks a pass once the hub is at capacity", () => {
    const game = new Game(parseLevel("h", ["A.A", ".1.", "B.B"]));
    play(game, [
      [0, 0],
      [1, 1],
      [2, 0],
    ]);
    // The hub's single pass is spent, so the second line cannot use it.
    const game2 = game;
    game2.beginAt(indexOf(game2.level, 0, 2));
    expect(game2.dragTo(indexOf(game2.level, 1, 1))).toBe("none");
  });

  it("is unsolved while a hub is under its dot count", () => {
    const game = new Game(parseLevel("h", board));
    play(game, [
      [0, 0],
      [1, 1],
      [2, 2],
    ]);
    // Line A is done, but the hub still wants a second pass.
    expect(game.isShapeComplete(0)).toBe(true);
    expect(game.solved).toBe(false);
  });
});

describe("crossing", () => {
  it("refuses a diagonal that would cross one already drawn", () => {
    // Two lines whose only routes are the two diagonals of one square.
    const game = new Game(parseLevel("x", ["AB", "BA"]));
    play(game, [
      [0, 0],
      [1, 1],
    ]);
    game.beginAt(indexOf(game.level, 1, 0));
    expect(game.dragTo(indexOf(game.level, 0, 1))).toBe("none");
  });

  it("refuses to redraw a segment another line already used", () => {
    const level = parseLevel("s", ["A.B", ".2.", "B.A"]);
    const game = new Game(level);
    play(game, [
      [0, 0],
      [1, 1],
      [2, 2],
    ]);
    game.paths.set(1, [indexOf(level, 2, 0)]);
    game.activeShape = 1;
    // Segment (1,1)-(2,2) belongs to the first line now.
    expect(
      canExtend(level, game.paths, 1, indexOf(level, 1, 1)),
    ).toBe(true);
    game.dragTo(indexOf(level, 1, 1));
    expect(game.dragTo(indexOf(level, 2, 2))).toBe("none");
  });
});
