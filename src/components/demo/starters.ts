import { templateProject } from "@/lib/demo-server/template";

export type Starter = { title: string; emoji: string; color: string; description: string; html: string };

// This shared generator is pure: no provider clients, credentials or server APIs.
// Use its metadata-bearing documents so starter revisions follow the same path
// as prompt-created templates, rather than silently preserving unrecognized HTML.
export const starters: Starter[] = [
  {
    title: "Rainbow studio", emoji: "🎨", color: "peach",
    description: "Draw a garden world. Change the colors and make it yours.",
    html: templateProject("a purple garden drawing canvas").html,
  },
  {
    title: "Animal match", emoji: "🐼", color: "mint",
    description: "Find four pairs of ocean friends. Try a new theme next.",
    html: templateProject("an easier purple ocean memory matching game").html,
  },
  {
    title: "Space explorer", emoji: "🪐", color: "lilac",
    description: "Collect the stars. Change the world, color or challenge.",
    html: templateProject("an easier purple space collecting game").html,
  },
];
