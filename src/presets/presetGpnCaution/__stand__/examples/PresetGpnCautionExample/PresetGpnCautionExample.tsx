import React from 'react';

import { ConstructorExample } from '##/__mocks__/ConstructorExample';
import {
  presetGpnCautionDark,
  presetGpnCautionDefault,
} from '##/presets/presetGpnCaution';

export const PresetGpnCautionExample = () => {
  return (
    <ConstructorExample
      presets={[presetGpnCautionDefault, presetGpnCautionDark]}
    />
  );
};
