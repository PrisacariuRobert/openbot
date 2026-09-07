import type { MascotKind } from "../shared/types";
import { Character } from "./Character";
import { mascotColors, mascotShapes } from "./mascot-catalog";

export function AppearancePicker({
  name,
  color,
  shape,
  onColor,
  onShape,
}: {
  name: string;
  color: string;
  shape: MascotKind;
  onColor: (color: string) => void;
  onShape: (shape: MascotKind) => void;
}) {
  return (
    <div className="appearance-picker">
      <fieldset>
        <legend>Character</legend>
        <div className="shape-options">
          {mascotShapes.map((item) => (
            <button
              type="button"
              key={item.id}
              aria-label={item.label}
              aria-pressed={shape === item.id}
              onClick={() => onShape(item.id)}
            >
              <Character
                name={name || item.name}
                color={color}
                variant={item.id}
                size={50}
              />
              <span>{item.name}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Color</legend>
        <div className="color-options">
          {mascotColors.map(([label, value]) => (
            <button
              type="button"
              key={value}
              aria-label={`${label} character`}
              aria-pressed={color.toLowerCase() === value}
              onClick={() => onColor(value)}
            >
              <Character
                name={`${label} preview`}
                color={value}
                variant={shape}
                size={36}
              />
            </button>
          ))}
        </div>
        <label className="custom-character-color">
          Custom color{" "}
          <input
            aria-label="Custom character color"
            type="color"
            value={color}
            onChange={(event) => onColor(event.target.value)}
          />
        </label>
      </fieldset>
    </div>
  );
}
