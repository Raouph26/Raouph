import { describe, expect, it } from "vitest";
import { ALL_LEVELS } from "../src/levels";
import { assertWellFormed, formatLevel, shapesIn } from "../src/core/level";
import { solve } from "../src/core/solver";
import { isSolved } from "../src/core/rules";

describe("shipped levels", () => {
  it("ships a non-trivial pack", () => {
    expect(ALL_LEVELS.length).toBeGreaterThan(20);
  });

  it("has unique level ids", () => {
    const ids = ALL_LEVELS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const level of ALL_LEVELS) {
    describe(`level ${level.id}`, () => {
      it("is well formed", () => {
        expect(() => assertWellFormed(level)).not.toThrow();
        expect(level.cells.length).toBe(level.width * level.height);
        expect(shapesIn(level).length).toBeGreaterThan(0);
      });

      it("has exactly one solution", () => {
        const { solutions, exhausted } = solve(level, { limit: 2 });
        expect(exhausted).toBe(false);
        // Printing the board makes a regression readable in CI output.
        expect(
          solutions.length,
          `level ${level.id}\n${formatLevel(level).join("\n")}`,
        ).toBe(1);
      });

      it("accepts its own solution as solved", () => {
        const { solutions } = solve(level, { limit: 1 });
        expect(isSolved(level, solutions[0])).toBe(true);
      });
    });
  }
});
