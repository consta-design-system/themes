import { presetGpnDefault, Theme, ThemePreset } from '@consta/uikit/Theme';
import React from 'react';

import { ExampleVariants } from './examples/ExampleVariants';
import { useVariants } from './useVariants';

const Variants = () => {
  const { color, ...mods } = useVariants();

  const preset: ThemePreset = {
    ...presetGpnDefault,
    ...mods,
    ...(color
      ? {
          color: {
            primary: color,
            invert: color,
            accent: color,
          },
        }
      : {}),
  };

  console.log(preset);

  return (
    <Theme preset={preset}>
      <ExampleVariants />
    </Theme>
  );
};

export default Variants;
