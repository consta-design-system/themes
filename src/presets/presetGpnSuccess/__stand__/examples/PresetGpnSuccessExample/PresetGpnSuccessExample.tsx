import React from 'react';

import { ConstructorExample } from '##/__mocks__/ConstructorExample';
import {
  presetGpnSuccessDark,
  presetGpnSuccessDefault,
} from '##/presets/presetGpnSuccess';

export const PresetGpnSuccessExample = () => {
  return (
    <ConstructorExample
      presets={[presetGpnSuccessDefault, presetGpnSuccessDark]}
    />
  );
};
