import { useId } from "react";
import "./mapThemeSelector.css";

type MapThemeSelectorProps = {
  theme: "hoi4" | "eu4";
  onChange: (theme: "hoi4" | "eu4") => void;
};

const themes = [
  { id: "hoi4", label: "HOI4", title: "Hearts of Iron IV" },
  { id: "eu4", label: "EU4", title: "Europa Universalis IV" },
] as const;

export function MapThemeSelector({ theme, onChange }: MapThemeSelectorProps) {
  const name = useId();

  return (
    <fieldset className="map-theme-selector">
      <legend className="map-theme-legend">Map theme</legend>
      <span className="map-theme-label" aria-hidden="true">Map theme</span>
      <div className="map-theme-options">
        {themes.map((option) => (
          <label key={option.id} className="map-theme-option" title={option.title}>
            <input
              type="radio"
              name={name}
              value={option.id}
              checked={theme === option.id}
              onChange={() => onChange(option.id)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
