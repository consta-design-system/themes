import './_color/Theme_color_gpnAlertDefault.css';
import './_color/Theme_color_gpnAlertDark.css';

import { ThemePreset } from '@consta/uikit/Theme';

export const presetGpnAlertDark: ThemePreset = {
  color: {
    primary: 'gpnAlertDark',
    accent: 'gpnAlertDefault',
    invert: 'gpnAlertDefault',
  },
  control: 'gpnDefault',
  font: 'gpnDefault',
  size: 'gpnDefault',
  space: 'gpnDefault',
  shadow: 'gpnDefault',
};
