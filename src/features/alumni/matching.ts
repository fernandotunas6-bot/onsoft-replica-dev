export type AlumniMatchProfile = {
  id: string;
  graduationYear?: number | null;
  industry?: string | null;
  province?: string | null;
  city?: string | null;
  skills?: string[] | null;
  interests?: string[] | null;
  availableForMentoring?: boolean | null;
  seekingMentor?: boolean | null;
};

export type AlumniMatchScore = {
  score: number;
  reasons: string[];
};

function normaliseList(values?: string[] | null) {
  return new Set((values ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean));
}

function overlapCount(a?: string[] | null, b?: string[] | null) {
  const left = normaliseList(a);
  const right = normaliseList(b);
  let count = 0;
  for (const value of left) if (right.has(value)) count += 1;
  return count;
}

export function scoreMentorMatch(
  mentee: AlumniMatchProfile,
  mentor: AlumniMatchProfile,
): AlumniMatchScore {
  if (mentee.id === mentor.id || !mentor.availableForMentoring) return { score: 0, reasons: [] };

  let score = 0;
  const reasons: string[] = [];

  const skillMatches =
    overlapCount(mentee.interests, mentor.skills) + overlapCount(mentee.skills, mentor.skills);
  if (skillMatches > 0) {
    const points = Math.min(skillMatches, 4) * 12;
    score += points;
    reasons.push(`${skillMatches} competência(s)/interesse(s) em comum`);
  }

  if (
    mentee.industry &&
    mentor.industry &&
    mentee.industry.trim().toLowerCase() === mentor.industry.trim().toLowerCase()
  ) {
    score += 20;
    reasons.push("Mesmo sector profissional");
  }

  if (
    mentee.province &&
    mentor.province &&
    mentee.province.trim().toLowerCase() === mentor.province.trim().toLowerCase()
  ) {
    score += 10;
    reasons.push("Mesma província");
  }

  if (
    mentee.city &&
    mentor.city &&
    mentee.city.trim().toLowerCase() === mentor.city.trim().toLowerCase()
  ) {
    score += 5;
    reasons.push("Mesma cidade");
  }

  if (mentee.graduationYear && mentor.graduationYear) {
    const gap = mentee.graduationYear - mentor.graduationYear;
    if (gap >= 3) {
      score += Math.min(gap, 10);
      reasons.push(`${gap} ano(s) de diferença de coorte`);
    }
  }

  if (mentee.seekingMentor) {
    score += 7;
    reasons.push("Alumni está activamente à procura de mentor");
  }

  return { score: Math.min(score, 100), reasons };
}

export function rankMentors(mentee: AlumniMatchProfile, mentors: AlumniMatchProfile[], limit = 10) {
  return mentors
    .map((mentor) => ({ mentor, ...scoreMentorMatch(mentee, mentor) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || String(a.mentor.id).localeCompare(String(b.mentor.id)))
    .slice(0, Math.max(1, limit));
}
