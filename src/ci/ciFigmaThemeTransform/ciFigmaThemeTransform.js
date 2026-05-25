"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");
var _defineProperty2 = _interopRequireDefault(require("@babel/runtime/helpers/defineProperty"));
var _command = require("@oclif/command");
var _fsExtra = require("fs-extra");
var _logSymbols = _interopRequireDefault(require("log-symbols"));
var _path = require("path");
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { (0, _defineProperty2.default)(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}
const parseVarName = name => {
  return `--${name.split('/').join('-')}`;
};
const parseVarValueColor = value => {
  const keys = Object.keys(value);
  return `${keys.join('')}(${keys.map(key => value[key]).join(', ')})`;
};
const parseVarValueString = value => {
  return `${value}`;
};
const parseVarValueFloat = value => {
  return `${value}px`;
};
const parseVarAlias = (value, varsNames) => {
  return `var(${varsNames[value.id]})`;
};
const isVarAlias = value => {
  return value.type === 'VARIABLE_ALIAS';
};
const isVarColor = value => {
  return value.type === 'COLOR';
};
const isVarString = value => {
  return value.type === 'STRING';
};
const isVarFloat = value => {
  return value.type === 'FLOAT';
};
const getFileName = (variable, themeName, modeName) => {
  const formattedThemeName = themeName.replaceAll(' ', '');
  const formattedModeName = `_${variable.name.split('/')[0]}_${modeName}`.replaceAll(' ', '').toLocaleLowerCase();
  return `${formattedThemeName}${formattedModeName}`;
};
const parseVar = (variable, data, themeJs, themeName, varsNames) => {
  const keys = Object.keys(variable.valuesByMode);
  keys.forEach(modeId => {
    const modeName = data.modes[modeId];
    const fileName = getFileName(variable, themeName, modeName);
    if (themeJs[fileName] === undefined) {
      themeJs[fileName] = {};
    }
    if (isVarAlias(variable.valuesByMode[modeId])) {
      themeJs[fileName][parseVarName(variable.name)] = parseVarAlias(variable.valuesByMode[modeId], varsNames);
      return;
    }
    if (isVarColor(variable)) {
      themeJs[fileName][parseVarName(variable.name)] = parseVarValueColor(variable.valuesByMode[modeId]);
      return;
    }
    if (isVarString(variable)) {
      themeJs[fileName][parseVarName(variable.name)] = parseVarValueString(variable.valuesByMode[modeId]);
      return;
    }
    if (isVarFloat(variable)) {
      themeJs[fileName][parseVarName(variable.name)] = parseVarValueFloat(variable.valuesByMode[modeId]);
    }
  });
};
const parseFile = async (flags, file, varsNames, themeJs) => {
  const data = await (0, _fsExtra.readJSON)((0, _path.join)(flags.path, file));
  data.variables.forEach(variable => {
    parseVar(variable, data, themeJs, flags.name, varsNames);
  });
  return themeJs;
};
const varNameByID = async (flags, file) => {
  const data = await (0, _fsExtra.readJSON)((0, _path.join)(flags.path, file));
  const vars = {};
  data.variables.forEach(variable => {
    vars[variable.id] = parseVarName(variable.name);
  });
  return vars;
};
const ObjectToCss = (obj, name) => {
  return `.${name}` + `{` + `\n${Object.keys(obj).map(key => `${key}: ${obj[key]};`).join('\n')}\n` + `}`;
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
      await (0, _fsExtra.remove)(flags.output);
      await (0, _fsExtra.mkdir)(flags.output);
      const varsNames = (await Promise.all(files.map(async fileName => {
        const result = await varNameByID(flags, fileName);
        return result;
      }))).reduce((acc, cur) => {
        return _objectSpread(_objectSpread({}, acc), cur);
      }, {});
      const themeJs = {};
      await Promise.all(files.map(async fileName => {
        const result = await parseFile(flags, fileName, varsNames, themeJs);
        return result;
      }));
      const cssFiles = Object.keys(themeJs);
      console.log(cssFiles);
      await Promise.all(cssFiles.map(async fileName => {
        await (0, _fsExtra.writeFile)(`${(0, _path.join)(flags.output, fileName)}.css`, ObjectToCss(themeJs[fileName], fileName));
      }));
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
  }),
  output: _command.flags.string({
    description: 'The path to a build config file.',
    default: undefined
  }),
  name: _command.flags.string({
    description: 'Theme name',
    default: 'KukiPuki'
  })
};
GenerateCommand.run();
