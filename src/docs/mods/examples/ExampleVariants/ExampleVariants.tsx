import './ExampleVariants.css';

import { Button } from '@consta/uikit/Button';
import { ChoiceGroup } from '@consta/uikit/ChoiceGroup';
import { FieldGroup } from '@consta/uikit/FieldGroup';
import { cnMixFlex } from '@consta/uikit/MixFlex';
import { Text } from '@consta/uikit/Text';
import { TextField } from '@consta/uikit/TextField';
import React, { useState } from 'react';

import { cn } from '##/utils/bem';

const cnExampleVariants = cn('ExampleVariants');

type ItemCG = string;

const CG = ['Выбери меня', 'Нет, меня'];

export const ExampleVariants: React.FC = () => {
  const [valueCG, setValueCG] = useState<ItemCG | null>(CG[0]);

  return (
    <div className={cnExampleVariants()}>
      <header className={cnExampleVariants('Header')} />
      <div
        className={cnExampleVariants('Main', [
          cnMixFlex({ direction: 'column', gap: 'm' }),
        ])}
      >
        <Text
          size="xl"
          as="p"
          view="secondary"
          lineHeight="s"
          className={cnExampleVariants('Description')}
        >
          Эта карточка — просто абстрактный пример интерфейса
        </Text>
        <ChoiceGroup
          name="CG"
          value={valueCG}
          onChange={setValueCG}
          items={CG}
          getItemLabel={(item) => item}
          size="l"
          multiple={false}
          width="full"
        />
        <FieldGroup size="l">
          <TextField
            placeholder="Допустим, длина"
            rightSide="м"
            form="defaultClear"
            style={{ width: '50%' }}
          />
          <TextField
            placeholder="и вес"
            rightSide="кг"
            form="brickDefault"
            style={{ width: '50%' }}
          />
        </FieldGroup>
        <Button size="l" label="Нажми на кнопку" width="full" />
      </div>
    </div>
  );
};
