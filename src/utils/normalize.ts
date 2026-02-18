const combiningMarkRegex = /[\u0300-\u036f]/g;

export function normalizeConjugation(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(combiningMarkRegex, "")
    .replace(/\s+/g, " ");
}
