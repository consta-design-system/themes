import './ConstructorExample.css';

import { IconArrowUp } from '@consta/icons/IconArrowUp';
import { Button } from '@consta/uikit/Button';
import { cnMixSpace } from '@consta/uikit/MixSpace';
import { Text } from '@consta/uikit/Text';
import { Theme, ThemePreset, useTheme } from '@consta/uikit/Theme';
import { useComponentSize } from '@consta/uikit/useComponentSize';
import { useFlag } from '@consta/uikit/useFlag';
import React, { useEffect, useRef } from 'react';

import { cn } from '##/utils/bem';

import { ConstructorExampleAnalytic } from './ConstructorExampleAnalytic';
import { ConstructorExampleControls } from './ConstructorExampleControls';
import { ConstructorExampleHeader } from './ConstructorExampleHeader';
import { ConstructorExampleInstaller } from './ConstructorExampleInstaller';
import { ConstructorExampleReport } from './ConstructorExampleReport';

const cnConstructorExample = cn('ConstructorExample');

export const ConstructorExample: React.FC<{
  presets: [ThemePreset, ThemePreset];
}> = ({ presets }) => {
  const [light, dark] = presets;

  const { theme } = useTheme();
  const preset = theme.color.primary === 'gpnDefault' ? light : dark;
  const [sticky, setSticky] = useFlag();
  const ref = useRef<HTMLDivElement>(null);

  const { height } = useComponentSize(ref);

  useEffect(() => {
    const onScroll = (_e: Event) => {
      if (window.scrollY + window.innerHeight >= height) {
        setSticky.on();
      } else {
        setSticky.off();
      }
    };
    window.addEventListener('scroll', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
    };
  }, [height]);

  return (
    <Theme
      ref={ref}
      preset={preset}
      className={cnConstructorExample({ sticky }, [cnMixSpace({ mT: '2xl' })])}
      style={{ ['--constructor-example-height' as string]: `${height}px` }}
    >
      <ConstructorExampleHeader className={cnConstructorExample('Header')} />
      <div
        className={cnConstructorExample('Wrapper', [
          cnMixSpace({ pT: '3xl', pB: '6xl', pH: '3xl' }),
        ])}
      >
        <ConstructorExampleControls
          className={cnMixSpace({ pT: '3xl', pB: '6xl' })}
        />
        <ConstructorExampleAnalytic />
        <ConstructorExampleReport className={cnMixSpace({ mT: '3xl' })} />
        <ConstructorExampleInstaller className={cnMixSpace({ mT: '5xl' })} />
      </div>
      <Text
        className={cnConstructorExample('Footer', [
          cnMixSpace({ pV: 'm', pH: '3xl' }),
        ])}
      >
        Наверх
        <Button
          className={cnMixSpace({ mL: 's' })}
          size="s"
          view="ghost"
          onlyIcon
          form="round"
          iconLeft={IconArrowUp}
        />
      </Text>
    </Theme>
  );
};
