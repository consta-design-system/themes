import React from 'react';

import { ConstructorExample } from '##/__mocks__/ConstructorExample';
import {
  presetGpnNormalDark,
  presetGpnNormalDefault,
} from '##/presets/presetGpnNormal';

export const PresetGpnNormalExample = () => {
  return (
    <ConstructorExample
      presets={[presetGpnNormalDefault, presetGpnNormalDark]}
    />
  );
};
