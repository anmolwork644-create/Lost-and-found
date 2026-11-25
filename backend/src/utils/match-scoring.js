const stopWords = new Set(["the", "and", "with", "for", "near", "has", "left", "lost", "found", "my", "inside", "on", "of", "item"]);
export const MIN_POSSIBLE_MATCH_SCORE = 45;

function tokens(value = "") {
  return new Set(value.toLowerCase().match(/[a-z0-9]+/g)?.filter((word) => word.length > 2 && !stopWords.has(word)) ?? []);
}

function overlap(left, right) {
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / Math.max(left.size, right.size);
}

export function scoreMatch(target, candidate) {
  const nameSimilarity = overlap(tokens(target.name), tokens(candidate.name));
  const descriptionSimilarity = overlap(tokens(target.description), tokens(candidate.description));
  const locationSimilarity = overlap(tokens(target.location), tokens(candidate.location));
  const sameCategory = target.category === candidate.category;
  const daysApart = Math.abs(new Date(target.itemDate) - new Date(candidate.itemDate)) / 86_400_000;
  const dateSimilarity = Math.max(0, 1 - daysApart / 14);
  const score =
    (sameCategory ? 0.28 : 0) +
    nameSimilarity * 0.28 +
    descriptionSimilarity * 0.19 +
    Math.max(locationSimilarity, target.location === candidate.location ? 1 : 0) * 0.12 +
    dateSimilarity * 0.13;
  const reasons = [];
  if (sameCategory) reasons.push("Same category");
  if (nameSimilarity >= 0.25) reasons.push("Similar item name");
  if (descriptionSimilarity >= 0.2) reasons.push("Related description details");
  if (locationSimilarity >= 0.3 || target.location === candidate.location) reasons.push("Nearby location");
  if (daysApart <= 3) reasons.push("Dates are close");
  return { score: Math.round(score * 100), reasons };
}
