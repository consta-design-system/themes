// запуск бабеля для проверке в dev
// yarn babel src/ci/ciFigmaThemeTransform/ciFigmaThemeTransform.ts --out-file src/ci/ciFigmaThemeTransform/ciFigmaThemeTransform.js --watch
// запуск скрипта в dev
// node ./src/ci/ciFigmaThemeTransform/ciFigmaThemeTransform.js --path=./src/ci/ciFigmaThemeTransform/__mocks__/figmaExport --output=./src/ci/ciFigmaThemeTransform/__mocks__/cssExport
// запуск скрипта в prod
// node @consta/theme/ci/ciFigmaThemeTransform --path=./bla/bla --output=./bla/bla

import { Command, flags } from '@oclif/command';
import { mkdir, readdir, readJSON, remove, writeFile } from 'fs-extra';
import logSymbols from 'log-symbols';
import { join } from 'path';

import {
  CiFlags,
  Collection,
  ThemeJs,
  ValueAlias,
  ValueByMode,
  Variable,
} from './types';

const parseVarName = (name: string) => {
  return `--${name.split('/').join('-')}`;
};

/**
 * Записывает в themeJs CSS-переменные для цвета с разложением на каналы.
 * Ключи каналов (r, g, b, a) берутся динамически из объекта value.
 * Создаёт переменные для каждого канала и основную переменную с var() ссылками.
 */
const setColorCssVariables = (
  themeJs: ThemeJs,
  fileName: string,
  varName: string,
  value: ValueByMode<'COLOR'>,
) => {
  const keys = Object.keys(value);
  keys.forEach((key) => {
    themeJs[fileName][`${varName}-${key}`] = `${
      value[key as keyof typeof value]
    }`;
  });
  themeJs[fileName][varName] = `${keys.join('')}(var(${keys
    .map((key) => `${varName}-${key}`)
    .join('), var(')}))`;
};

const parseVarValueString = (value: ValueByMode<'STRING'>) => {
  return `${value}`;
};

const parseVarValueFloat = (value: ValueByMode<'FLOAT'>) => {
  return `${value}px`;
};

const isVarAlias = (value: ValueByMode<any>) => {
  return (value as ValueAlias).type === 'VARIABLE_ALIAS';
};

const isVarColor = (
  value: Variable<'COLOR' | 'STRING' | 'FLOAT'>,
): value is Variable<'COLOR'> => {
  return value.type === 'COLOR';
};

const isVarString = (
  value: Variable<'COLOR' | 'STRING' | 'FLOAT'>,
): value is Variable<'STRING'> => {
  return value.type === 'STRING';
};

const isVarFloat = (
  value: Variable<'COLOR' | 'STRING' | 'FLOAT'>,
): value is Variable<'FLOAT'> => {
  return value.type === 'FLOAT';
};

const getFileName = (
  variable: Variable<'COLOR' | 'STRING' | 'FLOAT'>,
  themeName: string,
  modeName: string,
) => {
  const formattedThemeName = themeName.replaceAll(' ', '');
  const formattedModeName = `_${variable.name.split('/')[0]}_${modeName}`
    .replaceAll(' ', '')
    .toLocaleLowerCase();

  return `${formattedThemeName}${formattedModeName}`;
};

/**
 * Строит словарь id → resolvedValue из primitives.json.
 * Использует поле resolvedValuesByMode, которое уже содержит финальные значения.
 */
const buildPrimitivesResolvedValues = async (
  flags: CiFlags,
): Promise<
  Record<string, { type: 'COLOR' | 'STRING' | 'FLOAT'; value: any }>
> => {
  const data: Collection = await readJSON(join(flags.path, 'primitives.json'));
  const resolved: Record<
    string,
    { type: 'COLOR' | 'STRING' | 'FLOAT'; value: any }
  > = {};

  data.variables.forEach((variable) => {
    const variableAny = variable as any;
    const resolvedVBM = variableAny.resolvedValuesByMode as
      | Record<
          string,
          { resolvedValue: any; alias: string | null; aliasName?: string }
        >
      | undefined;
    const modeKeys = Object.keys(resolvedVBM || {});
    if (modeKeys.length > 0) {
      const modeKey = modeKeys[0];
      const resolvedEntry = resolvedVBM?.[modeKey];
      if (resolvedEntry && resolvedEntry.resolvedValue !== undefined) {
        resolved[variable.id] = {
          type: variable.type,
          value: resolvedEntry.resolvedValue,
        };
      }
    }
  });

  return resolved;
};

/**
 * Строит словарь ref-переменных из semantic.json.
 * Ref-переменные имеют ID вида VariableID:99:* и ссылаются на base-переменные из primitives.
 */
const buildRefVariablesMap = async (
  flags: CiFlags,
): Promise<
  Record<
    string,
    {
      type: 'COLOR' | 'STRING' | 'FLOAT';
      valuesByMode: Record<string, ValueByMode<any>>;
    }
  >
> => {
  const data: Collection = await readJSON(join(flags.path, 'semantic.json'));
  const refVars: Record<
    string,
    {
      type: 'COLOR' | 'STRING' | 'FLOAT';
      valuesByMode: Record<string, ValueByMode<any>>;
    }
  > = {};

  data.variables.forEach((variable) => {
    // Ref-переменные имеют ID вида VariableID:99:*

    refVars[variable.id] = {
      type: variable.type,
      valuesByMode: variable.valuesByMode,
    };
  });

  return refVars;
};

/**
 * Резолвит raw-значение цвета для COLOR-переменной через цепочку алисов.
 * Возвращает ValueByMode<'COLOR'> с каналами {r, g, b, a}.
 */
const resolveRawColorValue = (
  modeValue: ValueByMode<any>,
  modeId: string,
  refVars: Record<
    string,
    {
      type: 'COLOR' | 'STRING' | 'FLOAT';
      valuesByMode: Record<string, ValueByMode<any>>;
    }
  >,
  primitivesResolvedValues: Record<
    string,
    { type: 'COLOR' | 'STRING' | 'FLOAT'; value: any }
  >,
): ValueByMode<'COLOR'> | null => {
  if (!isVarAlias(modeValue)) {
    return null;
  }

  const alias = modeValue as ValueAlias;

  // Шаг 1: ищем ref-переменную по ID алиаса
  const refVar = refVars[alias.id];
  if (!refVar) {
    // Если ref не найден, пробуем сразу искать в primitives
    const resolved = primitivesResolvedValues[alias.id];
    if (resolved && resolved.type === 'COLOR') {
      return resolved.value as ValueByMode<'COLOR'>;
    }
    return null;
  }

  // Шаг 2: берём значение ref-переменной для того же modeId
  const refModeValue = refVar.valuesByMode[modeId];
  if (!refModeValue) {
    return null;
  }

  // Шаг 3: если ref ссылается на другой алиас — резолвим его из primitives
  if (isVarAlias(refModeValue)) {
    const refAlias = refModeValue as ValueAlias;
    const resolved = primitivesResolvedValues[refAlias.id];
    if (resolved && resolved.type === 'COLOR') {
      return resolved.value as ValueByMode<'COLOR'>;
    }
    return null;
  }

  // Шаг 4: если ref имеет прямое значение цвета — возвращаем его
  return refModeValue as ValueByMode<'COLOR'>;
};

const parseVar = (
  variable: Variable<'COLOR' | 'STRING' | 'FLOAT'>,
  data: Collection,
  themeJs: ThemeJs,
  themeName: string,
  refVars: Record<
    string,
    {
      type: 'COLOR' | 'STRING' | 'FLOAT';
      valuesByMode: Record<string, ValueByMode<any>>;
    }
  >,
  primitivesResolvedValues: Record<
    string,
    { type: 'COLOR' | 'STRING' | 'FLOAT'; value: any }
  >,
) => {
  const keys = Object.keys(variable.valuesByMode);

  keys.forEach((modeId) => {
    const modeName = data.modes[modeId];
    const fileName = getFileName(variable, themeName, modeName);

    if (themeJs[fileName] === undefined) {
      themeJs[fileName] = {};
    }

    const modeValue = variable.valuesByMode[modeId];
    const varName = parseVarName(variable.name);

    // Для COLOR-переменных — разложение на каналы
    if (isVarColor(variable)) {
      // Пытаемся получить raw-значение цвета через цепочку алисов
      const rawColor = resolveRawColorValue(
        modeValue,
        modeId,
        refVars,
        primitivesResolvedValues,
      );

      if (rawColor) {
        setColorCssVariables(themeJs, fileName, varName, rawColor);
        return;
      }

      // Если не алиас — парсим прямое значение цвета
      setColorCssVariables(
        themeJs,
        fileName,
        varName,
        modeValue as ValueByMode<'COLOR'>,
      );
      return;
    }

    // Для STRING и FLOAT — используем старую логику
    if (isVarString(variable)) {
      themeJs[fileName][varName] = parseVarValueString(
        modeValue as ValueByMode<'STRING'>,
      );
      return;
    }
    if (isVarFloat(variable)) {
      themeJs[fileName][varName] = parseVarValueFloat(
        modeValue as ValueByMode<'FLOAT'>,
      );
    }
  });
};

const parseFile = async (
  flags: CiFlags,
  file: string,
  themeJs: ThemeJs,
  refVars: Record<
    string,
    {
      type: 'COLOR' | 'STRING' | 'FLOAT';
      valuesByMode: Record<string, ValueByMode<any>>;
    }
  >,
  primitivesResolvedValues: Record<
    string,
    { type: 'COLOR' | 'STRING' | 'FLOAT'; value: any }
  >,
) => {
  const data: Collection = await readJSON(join(flags.path, file));

  data.variables.forEach((variable) => {
    // Пропускаем ref-переменные — они не должны попадать в CSS
    if (variable.id.startsWith('VariableID:99:')) {
      return;
    }

    parseVar(
      variable,
      data,
      themeJs,
      flags.name,
      refVars,
      primitivesResolvedValues,
    );
  });

  return themeJs;
};

const ObjectToCss = (obj: Record<string, string>, name: string) => {
  return (
    `.${name}` +
    `{` +
    `\n${Object.keys(obj)
      .map((key) => `${key}: ${obj[key]};`)
      .join('\n')}\n` +
    `}`
  );
};

class GenerateCommand extends Command {
  async run() {
    const hrStart = process.hrtime();
    const { flags } = this.parse<CiFlags, {}>(GenerateCommand as any);
    this.log(logSymbols.info, `generating theme in ${flags.path} ...`);

    try {
      const files = (await readdir(flags.path)).filter((file) =>
        file.endsWith('.json'),
      );

      this.log(logSymbols.info, `detected files ${files.join(', ')} ...`);

      await remove(flags.output);
      await mkdir(flags.output);

      // Загружаем resolved-значения из primitives.json для base-переменных
      const primitivesResolvedValues = await buildPrimitivesResolvedValues(
        flags,
      );

      // Загружаем ref-переменные из semantic.json
      const refVars = await buildRefVariablesMap(flags);

      // Находим semantic.json
      const semanticFileName = files.find((f) => f.includes('semantic'));
      if (!semanticFileName) {
        this.error('semantic.json not found');
        return;
      }

      const themeJs: ThemeJs = {};

      // Обрабатываем ТОЛЬКО semantic.json для генерации CSS
      await parseFile(
        flags,
        semanticFileName,
        themeJs,
        refVars,
        primitivesResolvedValues,
      );

      const cssFiles = Object.keys(themeJs);

      console.log(cssFiles);

      await Promise.all(
        cssFiles.map(async (fileName) => {
          await writeFile(
            `${join(flags.output, fileName)}.css`,
            ObjectToCss(themeJs[fileName], fileName),
          );
        }),
      );
    } catch (err) {
      this.error(err as any);
    }

    const hrEnd = process.hrtime(hrStart);

    this.log(logSymbols.success, `${flags.path} is transformed!`);

    this.log(`Execution time: ${hrEnd[0]}s`);
  }
}

GenerateCommand.flags = {
  path: flags.string({
    description: 'The path to a build config file.',
    default: undefined,
  }),
  output: flags.string({
    description: 'The path to a build config file.',
    default: undefined,
  }),
  name: flags.string({
    description: 'Theme name',
    default: 'KukiPuki',
  }),
};

GenerateCommand.run();
