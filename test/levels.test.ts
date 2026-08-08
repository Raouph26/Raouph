import { describe, expect, it } from "vitest";
import {
  CHAPTER_COUNT,
  DAILY_STAGES,
  STAGES_PER_CHAPTER,
  classicLevel,
  dailyLevel,
  todayKey,
} from "../src/core/chapters";
import { assertWellFormed, formatLevel, shapesIn } from "../src/core/level";
import { isSolved } from "../src/core/rules";
import { solve } from "../src/core/solver";
import type { Level } from "../src/core/types";

/**
 * Levels are generated on the player's device, so this samples across the ramp
 * rather than baking a fixture. `npm run validate` walks all 672.
 */
function expectPlayable(id: string, level: Level): void {
  expect(() => assertWellFormed(level)).not.toThrow();
  expect(shapesIn(level).length).toBeGreaterThan(0);
  expect(level.cells.length).toBe(level.width * level.height);

  const { solutions, exhausted } = solve(level, { limit: 2 });
  expect(exhausted, `${id} exhausted the solver`).toBe(false);
  expect(
    solutions.length,
    `${id}\n${formatLevel(level).join("\n")}`,
  ).toBe(1);
  expect(isSolved(level, solutions[0])).toBe(true);
}

describe("classic catalogue", () => {
  const chapters = [1, 2, 5, 6, 9, 13, 17, 20];
  const stages = [1, 16, 32];

  it("covers 20 chapters of 32 stages", () => {
    expect(CHAPTER_COUNT).toBe(20);
    expect(STAGES_PER_CHAPTER).toBe(32);
  });

  for (const chapter of chapters) {
    for (const stage of stages) {
      it(`c${chapter}-s${stage} is a playable, unique puzzle`, () => {
        expectPlayable(`c${chapter}-s${stage}`, classicLevel(chapter, stage));
      });
    }
  }

  it("keeps chapters 1-5 three columns wide", () => {
    for (let chapter = 1; chapter <= 5; chapter++) {
      for (const stage of [1, 32]) {
        const level = classicLevel(chapter, stage);
        expect(
          level.width,
          `c${chapter}-s${stage} is ${level.width} wide`,
        ).toBeLessThanOrEqual(3);
      }
    }
  });

  it("introduces the third colour no earlier than chapter 6", () => {
    for (let chapter = 1; chapter <= 5; chapter++) {
      for (const stage of [1, 16, 32]) {
        expect(shapesIn(classicLevel(chapter, stage)).length).toBeLessThanOrEqual(2);
      }
    }
  });

  it("is deterministic — the same id always builds the same board", () => {
    const first = formatLevel(classicLevel(7, 11));
    const second = formatLevel(classicLevel(7, 11));
    expect(second).toEqual(first);
  });
});

describe("daily catalogue", () => {
  const day = todayKey();

  it("offers 32 stages", () => {
    expect(DAILY_STAGES).toBe(32);
  });

  for (const stage of [1, 16, 32]) {
    it(`daily stage ${stage} is a playable, unique puzzle`, () => {
      expectPlayable(`daily-s${stage}`, dailyLevel(day, stage));
    });
  }

  it("gives different days different puzzles", () => {
    const a = formatLevel(dailyLevel("2026-01-02", 4));
    const b = formatLevel(dailyLevel("2026-01-03", 4));
    expect(a).not.toEqual(b);
  });
});
