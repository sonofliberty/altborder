import colorScheme from "./color-scheme.json";
export {
  customCountryAccentColor,
  getFallbackCountryColor,
  isHexColor,
  normalizeCountryColorName,
} from "./colorRuntime";
import { getFallbackCountryColor, normalizeCountryColorName } from "./colorRuntime";

type CountryColorInput = {
  id?: string;
  name: string;
  aliases?: string[];
};

export function getCountryColor(input: CountryColorInput): string {
  const idColor = input.id ? colorScheme.curatedColorsById[input.id as keyof typeof colorScheme.curatedColorsById] : undefined;
  if (idColor) return idColor;

  const nameColor = getCuratedNameColor([input.name, ...(input.aliases ?? [])]);
  if (nameColor) return nameColor;

  return getFallbackCountryColor(input.id || input.name);
}

function getCuratedNameColor(names: string[]): string | undefined {
  for (const name of names) {
    const color = colorScheme.curatedColorsByName[
      normalizeCountryColorName(name) as keyof typeof colorScheme.curatedColorsByName
    ];
    if (color) return color;
  }
  return undefined;
}
