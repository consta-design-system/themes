import './ExampleVariants.css';

import { Button } from '@consta/uikit/Button';
import { ChoiceGroup } from '@consta/uikit/ChoiceGroup';
import { DatePicker } from '@consta/uikit/DatePicker';
import { FieldGroup } from '@consta/uikit/FieldGroup';
import { cnMixFlex } from '@consta/uikit/MixFlex';
import { Text } from '@consta/uikit/Text';
import { TextField } from '@consta/uikit/TextField';
import React, { useState } from 'react';

import { cn } from '##/utils/bem';

const cnExampleVariants = cn('ExampleVariants');

type ItemCG = string;

const inputData = ['Багаж есть', 'Багажа нет'];

export const ExampleVariants: React.FC = () => {
  const [inputValue, setInputValue] = useState<ItemCG | null>(inputData[0]);
  const [dateValue, setDateValue] = useState<Date | null>(null);

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
          Быстрый поиск авиабилетов
        </Text>
        <FieldGroup size="l" style={{ width: '100%' }}>
          <TextField placeholder="Куда" />
          <DatePicker
            placeholder="Дата"
            value={dateValue}
            onChange={setDateValue}
          />
        </FieldGroup>

        <ChoiceGroup
          name="CG"
          value={inputValue}
          onChange={setInputValue}
          items={inputData}
          getItemLabel={(item) => item}
          size="l"
          multiple={false}
          width="full"
        />
        <Button size="l" label="Поиск" width="full" />
      </div>
    </div>
  );
};
