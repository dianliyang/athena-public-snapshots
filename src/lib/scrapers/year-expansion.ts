export function listSemestersForYear(uni: string, targetYear: number): string[] {
  const yy = String(targetYear).slice(-2);
  if (uni === "cau" || uni === "cau-sport") {
    const nextYy = String(targetYear + 1).slice(-2);
    return [`wi${yy}`, `sp${nextYy}`];
  }
  return [`wi${yy}`, `sp${yy}`, `su${yy}`, `fa${yy}`];
}
