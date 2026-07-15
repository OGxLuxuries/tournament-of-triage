/**
 * Skills matrix CSV parsing. Handles quoted fields (Google Sheets exports
 * wrap the comma-separated skills column in quotes), CRLF, and header
 * synonyms like "Email/Username" / "Confidence Level".
 */

export interface SkillRow {
  email: string;
  username: string;
  skills: string[];
  confidence: number;
}

/** RFC-4180-ish CSV → rows of cells. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

const CONFIDENCE_WORDS: Record<string, number> = {
  low: 1,
  novice: 1,
  learning: 2,
  medium: 3,
  mid: 3,
  moderate: 3,
  high: 4,
  expert: 5,
  master: 5,
};

function parseConfidence(raw: string): number {
  const numeric = Number.parseFloat(raw);
  if (Number.isFinite(numeric)) return Math.min(5, Math.max(1, Math.round(numeric)));
  return CONFIDENCE_WORDS[raw.trim().toLowerCase()] ?? 3;
}

function findColumn(header: string[], needles: string[]): number {
  return header.findIndex((cell) =>
    needles.some((needle) => cell.trim().toLowerCase().includes(needle)),
  );
}

/**
 * Schema: Email/Username, Skills (comma-separated), Confidence Level.
 * Header row is detected fuzzily; headerless files fall back to positional
 * columns (0: identity, 1: skills, 2: confidence).
 */
export function parseSkillsCsv(text: string): SkillRow[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];

  const header = rows[0];
  let emailCol = findColumn(header, ["email", "e-mail"]);
  let userCol = findColumn(header, ["user", "name", "handle", "player"]);
  let skillsCol = findColumn(header, ["skill"]);
  let confidenceCol = findColumn(header, ["confidence", "level", "rating"]);
  const hasHeader = skillsCol !== -1 || emailCol !== -1 || confidenceCol !== -1;

  if (!hasHeader) {
    emailCol = 0;
    userCol = 0;
    skillsCol = 1;
    confidenceCol = 2;
  }
  const identityFallback = emailCol !== -1 ? emailCol : userCol;

  return rows
    .slice(hasHeader ? 1 : 0)
    .map((cells): SkillRow | null => {
      const email = emailCol !== -1 ? (cells[emailCol] ?? "").trim() : "";
      let username = userCol !== -1 ? (cells[userCol] ?? "").trim() : "";
      const identity = (cells[identityFallback] ?? "").trim();
      if (!username) username = identity.includes("@") ? identity.split("@")[0] : identity;
      const skills = (skillsCol !== -1 ? (cells[skillsCol] ?? "") : "")
        .split(/[,;|/]/)
        .map((skill) => skill.trim().toLowerCase())
        .filter((skill) => skill.length > 0);
      const confidence = parseConfidence(
        confidenceCol !== -1 ? (cells[confidenceCol] ?? "") : "",
      );
      if (!email && !username) return null;
      return { email: email.includes("@") ? email : "", username, skills, confidence };
    })
    .filter((row): row is SkillRow => row !== null);
}
