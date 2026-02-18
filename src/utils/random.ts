export function randomItem<T>(items: readonly T[]): T {
  if (items.length === 0) {
    throw new Error("Cannot choose a random item from an empty list.");
  }

  const index = Math.floor(Math.random() * items.length);
  return items[index];
}
