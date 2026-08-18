import { describe, expect, it } from "vitest";
import { parseLevel } from "../src/core/level";
import { Game } from "../src/core/game";
import { indexOf } from "../src/core/types";
import { canExtend, crossingSegment, segKey } from "../src/core/rules";
import { solve } from "../src/core/solver";
import { MARK_BOARD } from "../src/render/mark";

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

describe("the brand mark's board", () => {
  const level = parseLevel("mark", MARK_BOARD);

  it("is a real level, with all three families and a hub", () => {
    const shapes = new Set(
      level.cells.flatMap((cell) => (cell.kind === "node" ? [cell.shape] : [])),
    );
    expect(shapes.size).toBe(3);
    expect(level.cells.some((cell) => cell.kind === "hub")).toBe(true);
  });

  it("has exactly one solution", () => {
    // The mark is drawn from the solver's answer, so an ambiguous board would
    // make the icon depend on search order — it would change without anyone
    // touching the drawing code.
    const { solutions } = solve(level, { limit: 4 });
    expect(solutions).toHaveLength(1);
  });

  it("is solved by a line through the hub for every colour", () => {
    const [solution] = solve(level, { limit: 1 }).solutions;
    expect(solution.size).toBe(3);
    for (const path of solution.values()) {
      expect(path).toHaveLength(3);
      expect(level.cells[path[1]].kind).toBe("hub");
    }
  });
});

describe("putting a line down and picking it up again", () => {
  it("resumes from the head, keeping what was drawn", () => {
    const game = new Game(parseLevel("t", ["Aaa", "..a", "..A"]));
    play(game, [
      [0, 0],
      [1, 0],
      [2, 0],
    ]);
    expect(game.activeShape).toBeNull();

    expect(game.beginAt(indexOf(game.level, 2, 0))).toBe("resume");
    expect(game.activeShape).toBe(0);
    expect(game.pathFor(0)).toHaveLength(3);

    // And carries on drawing from there.
    expect(game.dragTo(indexOf(game.level, 2, 1))).toBe("extend");
    expect(game.pathFor(0)).toHaveLength(4);
  });

  it("resumes a line left resting on a hub", () => {
    // The bug: a hub was never grabbable, so a line stopped on one was stuck.
    const game = new Game(parseLevel("h", ["A.B", ".2.", "B.A"]));
    play(game, [
      [0, 0],
      [1, 1],
    ]);
    expect(game.activeShape).toBeNull();

    expect(game.beginAt(indexOf(game.level, 1, 1))).toBe("resume");
    expect(game.activeShape).toBe(0);
    expect(game.dragTo(indexOf(game.level, 2, 2))).toBe("extend");
    expect(game.isShapeComplete(0)).toBe(true);
  });

  it("refuses a hub two lines are both resting on", () => {
    const game = new Game(parseLevel("h", ["A.B", ".2.", "B.A"]));
    play(game, [
      [0, 0],
      [1, 1],
    ]);
    play(game, [
      [2, 0],
      [1, 1],
    ]);
    // Ambiguous: nothing says which line the player meant to continue.
    expect(game.beginAt(indexOf(game.level, 1, 1))).toBe("none");
  });

  it("still truncates when grabbed mid-line", () => {
    const game = new Game(parseLevel("t", ["Aaa", "..a", "..A"]));
    play(game, [
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
    ]);
    expect(game.beginAt(indexOf(game.level, 1, 0))).toBe("truncate");
    expect(game.pathFor(0)).toHaveLength(2);
  });

  it("knows what can be grabbed", () => {
    const game = new Game(parseLevel("h", ["A.B", ".2.", "B.A"]));
    // Terminals always; an untouched hub never.
    expect(game.canGrabAt(indexOf(game.level, 0, 0))).toBe(true);
    expect(game.canGrabAt(indexOf(game.level, 1, 1))).toBe(false);

    play(game, [
      [0, 0],
      [1, 1],
    ]);
    expect(game.canGrabAt(indexOf(game.level, 1, 1))).toBe(true);
  });
});
