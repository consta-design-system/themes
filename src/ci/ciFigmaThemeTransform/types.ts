type VariableType = 'COLOR' | 'STRING' | 'FLOAT';

type ValueColor = {
  r: number;
  g: number;
  b: number;
  a: number;
};

type ValueFloat = number;
type ValueString = string;

type ValueAlias = { type: 'VARIABLE_ALIAS'; id: string };

type ValueByMode<T extends VariableType> =
  | (T extends 'COLOR'
      ? ValueColor
      : T extends 'STRING'
      ? ValueString
      : T extends 'FLOAT'
      ? ValueFloat
      : never)
  | ValueAlias;

export type Variable<T extends VariableType> = {
  id: string;
  name: string;
  description: string;
  type: T;
  valuesByMode: Record<string, ValueByMode<T>>;
  scopes: string[];
  hiddenFromPublishing: boolean;
  codeSyntax: {};
};

export type Collection = {
  id: string;
  name: string;
  modes: Record<string, string>;
  variableIds: string[];
  variables: Variable<'COLOR' | 'STRING' | 'FLOAT'>[];
};
