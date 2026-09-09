'use client';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Button } from '@/components/ui/button';
import { Mascot, type MascotShape } from './Product';
const palette = [
  ['Violet', '#6757d9'],
  ['Rose', '#ee6c98'],
  ['Leaf', '#299575'],
  ['Sky', '#528ed1'],
  ['Amber', '#c28735'],
  ['Slate', '#687588'],
];
export function Creator() {
  const [name, setName] = useState('Your next teammate');
  const [shape, setShape] = useState<MascotShape>('nova');
  const [color, setColor] = useState('#6757d9');
  return (
    <div className="character-stage">
      <div key={shape} className="character-spot">
        <Mascot
          shape={shape}
          color={color}
          label={name || 'Your teammate'}
          size={300}
          id="custom-character"
        />
      </div>
      <div className="creator-fields">
        <label htmlFor="teammate-name">
          Name
          <Input
            id="teammate-name"
            value={name}
            maxLength={30}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
          />
        </label>
        <label htmlFor="teammate-shape">
          Shape
          <NativeSelect
            id="teammate-shape"
            value={shape}
            onChange={(e) => setShape(e.target.value as MascotShape)}
          >
            {[
              ['nova', 'Robot'],
              ['blob', 'Bubble'],
              ['sprout', 'Sprout'],
              ['orbit', 'Orbit'],
              ['pebble', 'Pebble'],
              ['sunny', 'Sunny'],
            ].map(([value, label]) => (
              <NativeSelectOption key={value} value={value}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
      </div>
      <fieldset className="color-choices">
        <legend>Color</legend>
        {palette.map(([label, value]) => (
          <Button
            key={value}
            variant="ghost"
            aria-label={`${label} mascot color`}
            aria-pressed={color === value}
            onClick={() => setColor(value)}
            style={{ background: value }}
          >
            <span aria-hidden="true">{color === value ? '✓' : ''}</span>
          </Button>
        ))}
      </fieldset>
      <p className="quiet-label">
        Try a look here. Create your real teammate in OpenBot.
      </p>
    </div>
  );
}
