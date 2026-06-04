"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");
var _command = require("@oclif/command");
var _fsExtra = require("fs-extra");
var _logSymbols = _interopRequireDefault(require("log-symbols"));
var _path = require("path");
const parseVarName = name => {
  return `--${name.split('/').join('-')}`;
};
const setColorCssVariables = (themeJs, fileName, varName, value) => {
  const keys = Object.keys(value);
  keys.forEach(key => {
    themeJs[fileName][`${varName}-${key}`] = `${value[key]}`;
  });
  themeJs[fileName][varName] = `${keys.join('')}(var(${keys.map(key => `${varName}-${key}`).join('), var(')}))`;
};
const parseVarValueString = value => {
  return `${value}`;
};
const parseVarValueFloat = value => {
  return `${value}px`;
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
const buildPrimitivesResolvedValues = async flags => {
  const data = await (0, _fsExtra.readJSON)((0, _path.join)(flags.path, 'primitives.json'));
  const resolved = {};
  data.variables.forEach(variable => {
    const variableAny = variable;
    const resolvedVBM = variableAny.resolvedValuesByMode;
    const modeKeys = Object.keys(resolvedVBM || {});
    if (modeKeys.length > 0) {
      const modeKey = modeKeys[0];
      const resolvedEntry = resolvedVBM === null || resolvedVBM === void 0 ? void 0 : resolvedVBM[modeKey];
      if (resolvedEntry && resolvedEntry.resolvedValue !== undefined) {
        resolved[variable.id] = {
          type: variable.type,
          value: resolvedEntry.resolvedValue
        };
      }
    }
  });
  return resolved;
};
const buildRefVariablesMap = async flags => {
  const data = await (0, _fsExtra.readJSON)((0, _path.join)(flags.path, 'semantic.json'));
  const refVars = {};
  data.variables.forEach(variable => {
    refVars[variable.id] = {
      type: variable.type,
      valuesByMode: variable.valuesByMode
    };
  });
  return refVars;
};
const resolveRawColorValue = (modeValue, modeId, refVars, primitivesResolvedValues) => {
  if (!isVarAlias(modeValue)) {
    return null;
  }
  const alias = modeValue;
  const refVar = refVars[alias.id];
  if (!refVar) {
    const resolved = primitivesResolvedValues[alias.id];
    if (resolved && resolved.type === 'COLOR') {
      return resolved.value;
    }
    return null;
  }
  const refModeValue = refVar.valuesByMode[modeId];
  if (!refModeValue) {
    return null;
  }
  if (isVarAlias(refModeValue)) {
    const refAlias = refModeValue;
    const resolved = primitivesResolvedValues[refAlias.id];
    if (resolved && resolved.type === 'COLOR') {
      return resolved.value;
    }
    return null;
  }
  return refModeValue;
};
const parseVar = (variable, data, themeJs, themeName, refVars, primitivesResolvedValues) => {
  const keys = Object.keys(variable.valuesByMode);
  keys.forEach(modeId => {
    const modeName = data.modes[modeId];
    const fileName = getFileName(variable, themeName, modeName);
    if (themeJs[fileName] === undefined) {
      themeJs[fileName] = {};
    }
    const modeValue = variable.valuesByMode[modeId];
    const varName = parseVarName(variable.name);
    if (isVarColor(variable)) {
      const rawColor = resolveRawColorValue(modeValue, modeId, refVars, primitivesResolvedValues);
      if (rawColor) {
        setColorCssVariables(themeJs, fileName, varName, rawColor);
        return;
      }
      setColorCssVariables(themeJs, fileName, varName, modeValue);
      return;
    }
    if (isVarString(variable)) {
      themeJs[fileName][varName] = parseVarValueString(modeValue);
      return;
    }
    if (isVarFloat(variable)) {
      themeJs[fileName][varName] = parseVarValueFloat(modeValue);
    }
  });
};
const parseFile = async (flags, file, themeJs, refVars, primitivesResolvedValues) => {
  const data = await (0, _fsExtra.readJSON)((0, _path.join)(flags.path, file));
  data.variables.forEach(variable => {
    if (variable.id.startsWith('VariableID:99:')) {
      return;
    }
    parseVar(variable, data, themeJs, flags.name, refVars, primitivesResolvedValues);
  });
  return themeJs;
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
      const primitivesResolvedValues = await buildPrimitivesResolvedValues(flags);
      const refVars = await buildRefVariablesMap(flags);
      const semanticFileName = files.find(f => f.includes('semantic'));
      if (!semanticFileName) {
        this.error('semantic.json not found');
        return;
      }
      const themeJs = {};
      await parseFile(flags, semanticFileName, themeJs, refVars, primitivesResolvedValues);
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
