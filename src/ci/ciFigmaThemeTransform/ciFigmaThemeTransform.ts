// запуск бабеля для проверке в dev
// yarn babel src/ci/ciFigmaThemeTransform/ciFigmaThemeTransform.ts --out-file src/ci/ciFigmaThemeTransform/ciFigmaThemeTransform.js --watch
// запуск скрипта в dev
// node ./src/ci/ciFigmaThemeTransform/ciFigmaThemeTransform.js --path=./src/ci/ciFigmaThemeTransform/__mocks__/figmaExport
// запуск скрипта в prod
// node @consta/theme/ci/ciFigmaThemeTransform --path=./bla/bla --output=./bla/bla

import { Command, flags } from '@oclif/command';
import { time } from 'console';
import { readdir, readFile, readJSON } from 'fs-extra';
import logSymbols from 'log-symbols';
import { join, normalize, resolve } from 'path';

import { Collection } from './types';

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const parseFile = async (file: string) => {
  const data: Collection = await readJSON(file);
};

class GenerateCommand extends Command {
  async run() {
    const hrStart = process.hrtime();
    const { flags } = this.parse(GenerateCommand);
    this.log(logSymbols.info, `generating theme in ${flags.path} ...`);

    try {
      const files = (await readdir(flags.path)).filter((file) =>
        file.endsWith('.json'),
      );

      this.log(logSymbols.info, `detected files ${files.join(', ')} ...`);

      files.forEach(async (file) => {
        await parseFile(join(flags.path, file));
      });

      console.log(files);
      // console.log(flags);
      await sleep(5000);

      //   await remove(flags.path);
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
};

GenerateCommand.run();
