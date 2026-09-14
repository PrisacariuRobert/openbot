import { useRef } from "react";
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
  const customInput = useRef<HTMLInputElement>(null);
  const presetValues = new Set(mascotColors.map(([, value]) => value.toLowerCase()));
  const isCustom = !presetValues.has(color.toLowerCase());
  const customValue = /^#[0-9a-f]{6}$/i.test(color) ? color : "#6757d9";
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
          <button
            type="button"
            className="custom-color-swatch"
            aria-label="Custom character color"
            aria-pressed={isCustom}
            title="Custom color"
            onClick={() => customInput.current?.click()}
          >
            {isCustom ? (
              <Character
                name="Custom color preview"
                color={customValue}
                variant={shape}
                size={36}
              />
            ) : (
              <span className="rainbow-ring" aria-hidden="true" />
            )}
          </button>
        </div>
        <input
          ref={customInput}
          aria-hidden="true"
          tabIndex={-1}
          type="color"
          hidden
          value={customValue}
          onChange={(event) => onColor(event.target.value)}
        />
      </fieldset>
    </div>
  );
}
