// запуск бабеля для проверке в dev
// yarn babel src/ci/ciFigmaThemeTransform/ciFigmaThemeTransform.ts --out-file src/ci/ciFigmaThemeTransform/ciFigmaThemeTransform.js --watch
// запуск скрипта в dev
// node ./src/ci/ciFigmaThemeTransform/ciFigmaThemeTransform.js --path=./src/ci/ciFigmaThemeTransform/__mocks__/figmaExport --output=./src/ci/ciFigmaThemeTransform/__mocks__/cssExport
// запуск скрипта в prod
// node @consta/theme/ci/ciFigmaThemeTransform --path=./bla/bla --output=./bla/bla

import { Command, flags } from '@oclif/command';
import {
  ensureDir,
  pathExists,
  readdir,
  readJSON,
  remove,
  writeFile,
} from 'fs-extra';
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
  // const colorScheme = keys.join('');
  // console.log(colorScheme);
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
  flags: CiFlags,
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
    const modeName = flags.name + data.modes[modeId];

    console.log(modeName);

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
    // Если переменная — находится мосте ref, то пропускаем ее
    if (variable.name.includes('/ref/')) {
      return;
    }
    parseVar(
      flags,
      variable,
      data,
      themeJs,
      'Theme',
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

const legacyBridge: Record<string, Record<string, string>> = {
  color: {
    '--color-bg-default': 'var(--color-global-surface-view-default-primary)',
    '--color-bg-secondary':
      'var(--color-global-surface-view-default-secondary)',
    '--color-bg-brand': 'var(--color-global-surface-view-default-accent)',
    '--color-bg-link': 'var(--color-control-surface-view-default-primary)',
    '--color-bg-border': 'var(--color-global-border-view-default-primary)',
    '--color-bg-stripe': 'var(--color-global-surface-special-stripe)',
    '--color-bg-ghost': 'var(--color-global-surface-special-soft)',
    '--color-bg-tone': 'var(--color-global-surface-special-tone)',
    '--color-bg-soft': 'var(--color-global-surface-special-soft)',
    '--color-bg-system': 'var(--color-global-surface-status-neutral)',
    '--color-bg-normal': 'var(--color-global-surface-status-normal)',
    '--color-bg-success': 'var(--color-global-surface-status-success)',
    '--color-bg-caution': 'var(--color-global-surface-status-warning)',
    '--color-bg-warning': 'var(--color-global-surface-status-warning)',
    '--color-bg-alert': 'var(--color-global-surface-status-alert)',
    '--color-bg-critical': 'var(--color-global-surface-status-critical)',
    '--color-typo-primary': 'var(--color-global-typo-view-default-primary)',
    '--color-typo-secondary': 'var(--color-global-typo-view-default-secondary)',
    '--color-typo-ghost': 'var(--color-global-typo-view-default-ghost)',
    '--color-typo-brand': 'var(--color-global-typo-view-default-accent)',
    '--color-typo-system': 'var(--color-global-typo-view-default-secondary)',
    '--color-typo-normal': 'var(--color-global-typo-status-normal)',
    '--color-typo-success': 'var(--color-global-typo-status-success)',
    '--color-typo-caution': 'var(--color-global-typo-status-caution)',
    '--color-typo-warning': 'var(--color-global-typo-status-warning)',
    '--color-typo-alert': 'var(--color-global-typo-status-alert)',
    '--color-typo-critical': 'var(--color-global-typo-status-critical)',
    '--color-typo-link': 'var(--color-global-typo-view-default-accent)',
    '--color-typo-link-minor':
      'var(--color-global-typo-view-default-secondary)',
    '--color-typo-link-hover': 'var(--color-global-typo-view-hover-accent)',
    '--color-scroll-bg': 'var(--color-global-border-view-default-secondary)',
    '--color-scroll-thumb': 'var(--color-global-border-view-default-primary)',
    '--color-scroll-thumb-hover':
      'var(--color-global-border-view-hover-primary)',
    '--color-shadow-group-1': 'var(--color-global-surface-special-shadow)',
    '--color-shadow-group-2': 'var(--color-global-surface-special-shadow)',
    '--color-shadow-layer-1': 'var(--color-global-surface-special-shadow)',
    '--color-shadow-layer-2': 'var(--color-global-surface-special-shadow)',
    '--color-shadow-modal-1': 'var(--color-global-surface-special-shadow)',
    '--color-shadow-modal-2': 'var(--color-global-surface-special-shadow)',
    '--color-control-bg-default':
      'var(--color-input-surface-view-default-primary)',
    '--color-control-typo-default':
      'var(--color-input-typo-view-default-primary)',
    '--color-control-typo-placeholder':
      'var(--color-input-typo-special-default-placeholder)',
    '--color-control-bg-border-default':
      'var(--color-input-border-view-default-primary)',
    '--color-control-bg-border-default-hover':
      'var(--color-input-border-view-hover-primary)',
    '--color-control-bg-border-focus': 'var(--color-global-border-state-focus)',
    '--color-control-bg-focus': 'var(--color-global-border-state-focus)',
    '--color-control-bg-active':
      'var(--color-global-border-state-active-primary)',
    '--color-control-bg-primary':
      'var(--color-control-surface-view-default-primary)',
    '--color-control-bg-primary-hover':
      'var(--color-control-surface-view-hover-primary)',
    '--color-control-typo-primary':
      'var(--color-control-typo-view-default-primary)',
    '--color-control-typo-primary-hover':
      'var(--color-control-typo-view-hover-primary)',
    '--color-control-bg-secondary':
      'var(--color-control-surface-view-default-secondary)',
    '--color-control-bg-border-secondary':
      'var(--color-control-border-view-default-secondary)',
    '--color-control-bg-border-secondary-hover':
      'var(--color-control-border-view-hover-secondary)',
    '--color-control-typo-secondary':
      'var(--color-control-typo-view-default-secondary)',
    '--color-control-typo-secondary-hover':
      'var(--color-control-typo-view-hover-secondary)',
    '--color-control-bg-ghost':
      'var(--color-control-surface-view-default-ghost)',
    '--color-control-bg-ghost-hover':
      'var(--color-control-surface-view-hover-ghost)',
    '--color-control-typo-ghost':
      'var(--color-control-typo-view-default-ghost)',
    '--color-control-typo-ghost-hover':
      'var(--color-control-typo-view-hover-ghost)',
    '--color-control-bg-clear':
      'var(--color-control-surface-view-default-clear)',
    '--color-control-bg-clear-hover':
      'var(--color-control-surface-view-hover-clear)',
    '--color-control-typo-clear':
      'var(--color-control-typo-view-default-clear)',
    '--color-control-typo-clear-hover':
      'var(--color-control-typo-view-hover-clear)',
    '--color-control-bg-disable':
      'var(--color-control-surface-view-disabled-ghost)',
    '--color-control-bg-border-disable':
      'var(--color-control-border-view-disabled-secondary)',
    '--color-control-typo-disable':
      'var(--color-control-typo-view-disabled-primary)',
  },
};

const legacyBridgeKeys = Object.keys(legacyBridge);

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

      await parseFile(
        flags,
        semanticFileName,
        themeJs,
        refVars,
        primitivesResolvedValues,
      );

      const cssFiles = Object.keys(themeJs);

      console.log(cssFiles);

      if (flags.addLegacyBridge) {
        cssFiles.map((fileName) => {
          legacyBridgeKeys.map((key) => {
            if (fileName.includes(`_${key}_`)) {
              themeJs[fileName] = {
                ...themeJs[fileName],
                ...legacyBridge[key],
              };
            }
          });
        });
      }

      await Promise.all(
        cssFiles.map(async (fileName) => {
          const outputPathDir = join(flags.output);
          const outputPathFile = join(outputPathDir, `${fileName}.css`);
          await ensureDir(outputPathDir);
          if (await pathExists(outputPathFile)) {
            await remove(outputPathFile);
          }

          await writeFile(
            outputPathFile,
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
    description: 'The input path',
    default: undefined,
  }),
  output: flags.string({
    description: 'The output path',
    default: 'src/themes',
  }),
  name: flags.string({
    description: 'Theme name',
    default: 'app',
  }),
  create: flags.boolean({
    description: 'Create a new theme',
    default: false,
  }),
  addLegacyBridge: flags.boolean({
    description: 'Add legacy bridge',
    default: false,
  }),
};

GenerateCommand.run();
