import {
  CHAPTER_COUNT,
  CHAPTER_UNLOCK_THRESHOLD,
  DAILY_STAGES,
  STAGES_PER_CHAPTER,
  classicId,
  dailyId,
} from "./core/chapters";

import { THEMES } from "./render/palette";

const SOLVED_KEY = "quiet-lines.solved";
const MUTED_KEY = "quiet-lines.muted";
const THEME_KEY = "quiet-lines.theme";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/**
 * Solved-state and unlock rules.
 *
 * Stages open one at a time so there is always an obvious next thing to play,
 * but a chapter opens before the previous one is exhausted — being stuck on a
 * single hard puzzle should never wall off the rest of the game.
 */
export class Progress {
  private solved = new Set<string>(readJson<string[]>(SOLVED_KEY, []));
  muted = readJson<boolean>(MUTED_KEY, false);
  themeId = readJson<string>(THEME_KEY, THEMES[0].id);

  isSolved(id: string): boolean {
    return this.solved.has(id);
  }

  markSolved(id: string): void {
    if (this.solved.has(id)) return;
    this.solved.add(id);
    this.save();
  }

  save(): void {
    try {
      localStorage.setItem(SOLVED_KEY, JSON.stringify([...this.solved]));
      localStorage.setItem(MUTED_KEY, JSON.stringify(this.muted));
      localStorage.setItem(THEME_KEY, JSON.stringify(this.themeId));
    } catch {
      // Private-mode storage failures are not worth interrupting play for.
    }
  }

  chapterSolvedCount(chapter: number): number {
    let count = 0;
    for (let stage = 1; stage <= STAGES_PER_CHAPTER; stage++) {
      if (this.solved.has(classicId(chapter, stage))) count++;
    }
    return count;
  }

  totalClassicSolved(): number {
    let count = 0;
    for (let chapter = 1; chapter <= CHAPTER_COUNT; chapter++) {
      count += this.chapterSolvedCount(chapter);
    }
    return count;
  }

  isChapterUnlocked(chapter: number): boolean {
    if (chapter <= 1) return true;
    return this.chapterSolvedCount(chapter - 1) >= CHAPTER_UNLOCK_THRESHOLD;
  }

  /** The furthest stage reached in a chapter, which is the one to resume at. */
  furthestStage(chapter: number): number {
    for (let stage = 1; stage <= STAGES_PER_CHAPTER; stage++) {
      if (!this.solved.has(classicId(chapter, stage))) return stage;
    }
    return STAGES_PER_CHAPTER;
  }

  isStageUnlocked(chapter: number, stage: number): boolean {
    if (!this.isChapterUnlocked(chapter)) return false;
    if (stage <= 1) return true;
    return this.solved.has(classicId(chapter, stage - 1));
  }

  dailySolvedCount(dayKey: string): number {
    let count = 0;
    for (let stage = 1; stage <= DAILY_STAGES; stage++) {
      if (this.solved.has(dailyId(dayKey, stage))) count++;
    }
    return count;
  }

  isDailyStageUnlocked(dayKey: string, stage: number): boolean {
    if (stage <= 1) return true;
    return this.solved.has(dailyId(dayKey, stage - 1));
  }

  /** Chapters finished outright — the currency themes are bought with. */
  clearedChapters(): number {
    let count = 0;
    for (let chapter = 1; chapter <= CHAPTER_COUNT; chapter++) {
      if (this.chapterSolvedCount(chapter) === STAGES_PER_CHAPTER) count++;
    }
    return count;
  }

  isThemeUnlocked(id: string): boolean {
    const theme = THEMES.find((t) => t.id === id);
    if (!theme) return false;
    return this.clearedChapters() >= theme.unlockChapters;
  }

  /** Falls back to the default if a saved theme is no longer earned. */
  activeTheme(): (typeof THEMES)[number] {
    const chosen = THEMES.find((t) => t.id === this.themeId);
    return chosen && this.isThemeUnlocked(chosen.id) ? chosen : THEMES[0];
  }
}
