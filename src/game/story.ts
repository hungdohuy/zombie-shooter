import type { ThemeKind } from "./theme";

/**
 * Story mode campaign data. Each chapter is a self-contained round: clear
 * its waves (or defeat the boss) to advance to the next chapter's cutscene.
 */
export interface Chapter {
  title: string;
  story: string;
  theme: ThemeKind;
  /** Waves to clear to finish the chapter (ignored when `boss` is true). */
  waves: number;
  /** Boss chapters end by defeating the Zombie King instead of waves. */
  boss: boolean;
}

export const STORY_INTRO =
  "The silly zombies snatched all of Sugar Town's candy! " +
  "Blast through the meadow, brave the spooky night, and bonk the Zombie King to get it back!";

export const STORY_CHAPTERS: Chapter[] = [
  {
    title: "CHAPTER 1",
    story:
      "The Sunny Meadow — the zombie parade is trampling the flowers with candy in their pockets! Clear 3 waves to chase them off!",
    theme: "sunny",
    waves: 3,
    boss: false,
  },
  {
    title: "CHAPTER 2",
    story:
      "The Spooky Night — the zombies dragged the candy into the dark graveyard! Clear 3 more waves to follow the trail!",
    theme: "night",
    waves: 3,
    boss: false,
  },
  {
    title: "CHAPTER 3",
    story:
      "The Zombie King — there he is, sitting on the whole candy pile! Bonk the big king until he gives it all back!",
    theme: "night",
    waves: 0,
    boss: true,
  },
];

export const STORY_WIN =
  "You got every last candy back — Sugar Town is saved! You're the hero of the meadow!";
