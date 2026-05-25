type VariableType = 'COLOR' | 'STRING' | 'FLOAT';

export type ValueColor = Record<string, number>;

type ValueFloat = number;
type ValueString = string;

export type ValueAlias = { type: 'VARIABLE_ALIAS'; id: string };

export type ValueByMode<T extends VariableType> =
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

export type CiFlags = {
  name: string;
  path: string;
  output: string;
};

// export type ThemeJs = Record<string, Record<string, string>>;
export type ThemeJs = Record<string, Record<string, string>>;
