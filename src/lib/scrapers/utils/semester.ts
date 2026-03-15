export function parseCMUSemester(code: string): { term: string; year: number } {
  if (!code) return { term: "Fall", year: 2025 }; // Default

  const termCode = code.charAt(0);
  const yearCode = code.substring(1);
  
  const termMap: Record<string, string> = {
    'F': 'Fall',
    'S': 'Spring',
    'M': 'Summer'
  };
  
  const term = termMap[termCode] || "Fall";
  const year = 2000 + (parseInt(yearCode) || 25);

  return { term, year };
}

export function parseSemesterCode(code: string): { term: string; year: number } {
  const input = code.toLowerCase();
  const yearNum = parseInt(input.replace(/\D/g, "")) || 25;
  const year = 2000 + yearNum;
  
  let term = "Fall";
  if (input.includes('sp') || input.includes('spring')) term = "Spring";
  else if (input.includes('wi') || input.includes('winter')) term = "Winter";
  else if (input.includes('su') || input.includes('summer')) term = "Summer";
  
  return { term, year };
}

export function compareSemesters(
  a: { term: string; year: number },
  b: { term: string; year: number }
): number {
  if (a.year !== b.year) return a.year - b.year;

  const termOrder: Record<string, number> = {
    'Spring': 1,
    'Summer': 2,
    'Fall': 3,
    'Winter': 4,
  };

  return (termOrder[a.term] || 0) - (termOrder[b.term] || 0);
}
