import { Command, flags } from '@oclif/command';
import logSymbols from 'log-symbols';

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
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
    const hrStart = process.hrtime();
    const { flags } = this.parse(GenerateCommand);
    try {
      console.log(flags);
      await sleep(1000);
    } catch (err) {
      this.error(err);
    }
    const hrEnd = process.hrtime(hrStart);
    this.log(logSymbols.success, `${flags.path} is transformed!🗑️`);
    this.log(`Execution time: ${hrEnd[0]}s`);
  }
}
GenerateCommand.flags = {
  path: flags.string({
    description: 'The path to a build config file.',
    default: undefined,
  }),
};
GenerateCommand.description = 'transformed file...';
GenerateCommand.run();
