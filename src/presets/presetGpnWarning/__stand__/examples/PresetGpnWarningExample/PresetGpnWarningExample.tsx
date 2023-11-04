import React from 'react';

import { ConstructorExample } from '##/__mocks__/ConstructorExample';
import {
  presetGpnWarningDark,
  presetGpnWarningDefault,
} from '##/presets/presetGpnWarning';

export const PresetGpnWarningExample = () => {
  return (
    <ConstructorExample
      presets={[presetGpnWarningDefault, presetGpnWarningDark]}
    />
  );
};
