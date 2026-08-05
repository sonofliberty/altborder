export type CountrySearchOption = {
  id: string;
  name: string;
  meta?: string;
};

export function filterCountryOptions<T extends CountrySearchOption>(
  options: readonly T[],
  query: string,
  selectedId = "",
  limit = 12,
): T[] {
  const selectedName = options.find((option) => option.id === selectedId)?.name ?? "";
  const normalizedQuery = normalizeSearchText(query);
  const shouldShowAll = !normalizedQuery || normalizedQuery === normalizeSearchText(selectedName);
  const matches = shouldShowAll
    ? options
    : options.filter((option) => {
        return (
          normalizeSearchText(option.name).includes(normalizedQuery) ||
          normalizeSearchText(option.id).includes(normalizedQuery)
        );
      });

  return matches.slice(0, Math.max(0, limit));
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase();
}
