// A small vivid palette — each person gets a stable colour from their name,
// so avatars and leaderboard bars feel lively without looking random.
const PALETTE = [
  "#ff6b4a", // coral
  "#38b597", // teal
  "#e8b14e", // gold
  "#8b7bd8", // violet
  "#5b9bd5", // blue
  "#e86a9a", // rose
  "#f2a541", // amber
  "#5fb878", // green
];

export function colorForName(name: string | null | undefined): string {
  const s = name ?? "?";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
