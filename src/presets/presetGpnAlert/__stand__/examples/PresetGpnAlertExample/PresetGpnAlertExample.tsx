import React from 'react';

import { ConstructorExample } from '##/__mocks__/ConstructorExample';
import {
  presetGpnAlertDark,
  presetGpnAlertDefault,
} from '##/presets/presetGpnAlert';

export const PresetGpnAlertExample = () => {
  return (
    <ConstructorExample presets={[presetGpnAlertDefault, presetGpnAlertDark]} />
  );
};
