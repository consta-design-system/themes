import '##/Theme_color_highlightsGreenDark';
import '##/Theme_color_highlightsGreenDefault';

import { Example } from '@consta/stand';
import { Button } from '@consta/uikit/Button';
import { presetGpnDefault, Theme, ThemePreset } from '@consta/uikit/Theme';
import { withTooltip } from '@consta/uikit/withTooltip';
import React from 'react';

const ButtonWithTooltip = withTooltip({ content: 'Тултип в инвертной теме' })(
  Button,
);

const localPreset: ThemePreset = {
  ...presetGpnDefault,
  color: {
    primary: 'highlightsGreenDefault',
    invert: 'highlightsGreenDark',
    accent: 'highlightsGreenDark',
  },
};

export const ExampleSimple = () => (
  <Example>
    <ButtonWithTooltip label="кнопка в глобальной теме" />
    <Theme preset={localPreset}>
      <ButtonWithTooltip label="кнопка в локальной теме" />
    </Theme>
  </Example>
);
