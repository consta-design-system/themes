// запуск бабеля для проверке в dev
// yarn babel src/ci/ciFigmaThemeTransform/ciFigmaThemeTransform.ts --out-file src/ci/ciFigmaThemeTransform/ciFigmaThemeTransform.js --watch
// запуск скрипта в dev
// node ./src/ci/ciFigmaThemeTransform/ciFigmaThemeTransform.js --path=./src/ci/ciFigmaThemeTransform/__mocks__/figmaExport --output=./src/ci/ciFigmaThemeTransform/__mocks__/cssExport
// запуск скрипта в prod
// node @consta/theme/ci/ciFigmaThemeTransform --path=./bla/bla --output=./bla/bla

import { Command, flags } from '@oclif/command';
import { time } from 'console';
import {
  mkdir,
  readdir,
  readFile,
  readJSON,
  remove,
  writeFile,
} from 'fs-extra';
import logSymbols from 'log-symbols';
import { join, normalize, resolve } from 'path';

import {
  CiFlags,
  Collection,
  ThemeJs,
  ValueAlias,
  ValueByMode,
  ValueColor,
  Variable,
} from './types';

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const parseVarName = (name: string) => {
  return `--${name.split('/').join('-')}`;
};

const parseVarValueColor = (value: ValueByMode<'COLOR'>) => {
  const keys = Object.keys(value);
  return `${keys.join('')}(${keys
    .map((key) => value[key as keyof typeof value])
    .join(', ')})`;
};

const parseVarValueString = (value: ValueByMode<'STRING'>) => {
  return `${value}`;
};

const parseVarValueFloat = (value: ValueByMode<'FLOAT'>) => {
  return `${value}px`;
};

const parseVarAlias = (
  value: ValueAlias,
  varsNames: Record<string, string>,
) => {
  return `var(${varsNames[value.id]})`;
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

const parseVar = (
  variable: Variable<'COLOR' | 'STRING' | 'FLOAT'>,
  data: Collection,
  themeJs: ThemeJs,
  themeName: string,
  varsNames: Record<string, string>,
) => {
  const keys = Object.keys(variable.valuesByMode);

  keys.forEach((modeId) => {
    const modeName = data.modes[modeId];
    const fileName = getFileName(variable, themeName, modeName);

    if (themeJs[fileName] === undefined) {
      themeJs[fileName] = {};
    }

    if (isVarAlias(variable.valuesByMode[modeId])) {
      themeJs[fileName][parseVarName(variable.name)] = parseVarAlias(
        variable.valuesByMode[modeId] as ValueAlias,
        varsNames,
      );
      return;
    }
    if (isVarColor(variable)) {
      themeJs[fileName][parseVarName(variable.name)] = parseVarValueColor(
        variable.valuesByMode[modeId],
      );
      return;
    }
    if (isVarString(variable)) {
      themeJs[fileName][parseVarName(variable.name)] = parseVarValueString(
        variable.valuesByMode[modeId],
      );
      return;
    }
    if (isVarFloat(variable)) {
      themeJs[fileName][parseVarName(variable.name)] = parseVarValueFloat(
        variable.valuesByMode[modeId],
      );
    }
  });
};

const parseFile = async (
  flags: CiFlags,
  file: string,
  varsNames: Record<string, string>,
  themeJs: ThemeJs,
) => {
  const data: Collection = await readJSON(join(flags.path, file));

  data.variables.forEach((variable) => {
    parseVar(variable, data, themeJs, flags.name, varsNames);
  });

  return themeJs;
};

const varNameByID = async (flags: CiFlags, file: string) => {
  const data: Collection = await readJSON(join(flags.path, file));
  const vars: Record<string, string> = {};

  data.variables.forEach((variable) => {
    vars[variable.id] = parseVarName(variable.name);
  });

  return vars;
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

      const varsNames = (
        await Promise.all(
          files.map(async (fileName) => {
            const result = await varNameByID(flags, fileName);
            return result;
          }),
        )
      ).reduce((acc, cur) => {
        return { ...acc, ...cur };
      }, {});

      const themeJs: ThemeJs = {};

      await Promise.all(
        files.map(async (fileName) => {
          const result = await parseFile(flags, fileName, varsNames, themeJs);
          return result;
        }),
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
