import { variantsAtom, VariantType } from '@consta/stand';
import { standIdAtom } from '@consta/stand/src/modules/stand';
import { useAtom, useUpdate } from '@reatom/npm-react';

import { data } from './__mocks__/data';

type Value<TYPE extends VariantType, OPTION extends string | number> =
  | (TYPE extends 'boolean'
      ? boolean
      : TYPE extends 'date' | 'date-time'
      ? Date
      : TYPE extends 'number'
      ? number
      : TYPE extends 'select'
      ? OPTION
      : string)
  | undefined;

type VariantWithId<
  TYPE extends VariantType = VariantType,
  OPTION extends string | number = string,
> = {
  type: TYPE;
  name: string;
  value: Value<TYPE, OPTION>;
  options?: OPTION[] | readonly OPTION[];
  isActive: boolean;
  id: string;
};

export const useVariants = () => {
  const [variants] = useAtom(variantsAtom);
  const [standId] = useAtom(standIdAtom);

  useUpdate(
    (ctx) => {
      const variants = ctx.get(variantsAtom);
      const standId = ctx.get(standIdAtom);

      const mods = Object.keys(data) as Array<keyof typeof data>;

      const addState: Record<string, VariantWithId<'select'>> = {};

      for (let index = 0; index < mods.length; index++) {
        const name = mods[index];
        const options = data[name];

        const id = `${standId}-${name}`;
        const variant: VariantWithId<'select'> = {
          id: `${standId}-${name}`,
          isActive: true,
          name,
          options,
          type: 'select',
          value: options[0],
        };
        addState[id] = variant;
      }

      variantsAtom(ctx, { ...variants, ...addState });
    },
    [data],
  );

  const mods = Object.keys(data) as Array<keyof typeof data>;

  const values: Record<string, string> = {};

  for (let index = 0; index < mods.length; index++) {
    const name = mods[index];
    const value = variants[`${standId}-${name}`]?.value as string;

    if (value) {
      values[name] = value;
    }
  }

  return values;
};
