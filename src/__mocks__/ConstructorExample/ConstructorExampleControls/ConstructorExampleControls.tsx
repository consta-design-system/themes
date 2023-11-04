import './ConstructorExampleControls.css';

import { Button } from '@consta/uikit/Button';
import { cnMixSpace } from '@consta/uikit/MixSpace';
import { Text } from '@consta/uikit/Text';
import React from 'react';

import { cn } from '##/utils/bem';

const cnConstructorExampleControls = cn('ConstructorExampleControls');

export const ConstructorExampleControls = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => {
  return (
    <div className={cnConstructorExampleControls(null, [className])} {...props}>
      <Text size="xl" lineHeight="m" weight="semibold">
        Контролы и ссылки
      </Text>
      <div
        className={cnConstructorExampleControls('Buttons', [
          cnMixSpace({ mT: 'm' }),
        ])}
      >
        <Button label="Кнопка" view="primary" />
        <Button label="Кнопка" view="secondary" />
        <Button label="Кнопка" view="ghost" />
        <Button label="Кнопка" view="clear" />
      </div>
      <div
        className={cnConstructorExampleControls('Links', [
          cnMixSpace({ mT: 'm' }),
        ])}
      >
        <Text className={cnConstructorExampleControls('Link')}>link</Text>
        <Text className={cnConstructorExampleControls('Link', { minor: true })}>
          link-minor
        </Text>
        <Text className={cnConstructorExampleControls('Link', { hover: true })}>
          link-hover
        </Text>
      </div>
    </div>
  );
};
