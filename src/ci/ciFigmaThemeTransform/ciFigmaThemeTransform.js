"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");
var _command = require("@oclif/command");
var _fsExtra = require("fs-extra");
var _logSymbols = _interopRequireDefault(require("log-symbols"));
var _path = require("path");
function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}
const parseFile = async file => {
  const data = await (0, _fsExtra.readJSON)(file);
};
class GenerateCommand extends _command.Command {
  async run() {
    const hrStart = process.hrtime();
    const {
      flags
    } = this.parse(GenerateCommand);
    this.log(_logSymbols.default.info, `generating theme in ${flags.path} ...`);
    try {
      const files = (await (0, _fsExtra.readdir)(flags.path)).filter(file => file.endsWith('.json'));
      this.log(_logSymbols.default.info, `detected files ${files.join(', ')} ...`);
      files.forEach(async file => {
        await parseFile((0, _path.join)(flags.path, file));
      });
      console.log(files);
      await sleep(5000);
    } catch (err) {
      this.error(err);
    }
    const hrEnd = process.hrtime(hrStart);
    this.log(_logSymbols.default.success, `${flags.path} is transformed!`);
    this.log(`Execution time: ${hrEnd[0]}s`);
  }
}
GenerateCommand.flags = {
  path: _command.flags.string({
    description: 'The path to a build config file.',
    default: undefined
  })
};
GenerateCommand.run();
