const { resolve } = require('path');
const { Command, flags } = require('@oclif/command');
const logSymbols = require('log-symbols');

const { themeTransformed } = require('./helpers');

class GenerateCommand extends Command {
  async safeInvokeHook(hook) {
    if (hook !== undefined) {
      if (typeof hook === 'function') {
        this.log(`start executing ${hook.name}`);
        await hook();
        this.log(`finish executing ${hook.name}`);
      } else {
        this.error(`${hook.name} should be function!`);
      }
    }
  }

  async run() {
    const hrstart = process.hrtime();
    const { flags } = this.parse(GenerateCommand);
    const configPath = resolve(flags.config);
    let config = {};

    try {
      /*eslint-disable */
      config = require(configPath);
      /* eslint-enable */
    } catch (error) {
      this.error(`Can't load build config ${configPath}.`);
    }

    const { src, ignore = [], afterBuild } = config;

    try {
      await Promise.all([
        themeTransformed(ignore, src).then(() =>
          this.log(logSymbols.success, 'themes transformed'),
        ),
      ]);
      await this.safeInvokeHook(afterBuild);
    } catch (err) {
      this.error(err);
    }

    const hrend = process.hrtime(hrstart);

    this.log(
      logSymbols.success,
      `${process.env.npm_package_name} - pre-build finished!🔧💥`,
    );
    this.log(`Execution time: ${hrend[0]}s`);
  }
}

GenerateCommand.flags = {
  config: flags.string({
    description: 'The path to a build config file.',
    default: '.build.config.js',
  }),
};

GenerateCommand.description = 'Generate ts dist package...';

GenerateCommand.run();
