import type { Level } from "../core/types";
import { GENERATED_LEVELS } from "./generated";
import { TUTORIAL_LEVELS } from "./tutorial";

/** Play order: hand-authored teaching levels first, then the generated ramp. */
export const ALL_LEVELS: Level[] = [...TUTORIAL_LEVELS, ...GENERATED_LEVELS];
