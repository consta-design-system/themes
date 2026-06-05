"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");
var _defineProperty2 = _interopRequireDefault(require("@babel/runtime/helpers/defineProperty"));
var _command = require("@oclif/command");
var _fsExtra = require("fs-extra");
var _logSymbols = _interopRequireDefault(require("log-symbols"));
var _path = require("path");
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { (0, _defineProperty2.default)(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
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
const parseVar = (flags, variable, data, themeJs, themeName, refVars, primitivesResolvedValues) => {
  const keys = Object.keys(variable.valuesByMode);
  keys.forEach(modeId => {
    const modeName = flags.modValuePrefix + data.modes[modeId];
    console.log(modeName);
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
    if (variable.name.includes('/ref/')) {
      return;
    }
    parseVar(flags, variable, data, themeJs, 'Theme', refVars, primitivesResolvedValues);
  });
  return themeJs;
};
const ObjectToCss = (obj, name) => {
  return `.${name}` + `{` + `\n${Object.keys(obj).map(key => `${key}: ${obj[key]};`).join('\n')}\n` + `}`;
};
const legacyBridge = {
  color: {
    '--color-bg-default': 'var(--color-global-surface-view-default-primary)',
    '--color-bg-secondary': 'var(--color-global-surface-view-default-secondary)',
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
    '--color-typo-link-minor': 'var(--color-global-typo-view-default-secondary)',
    '--color-typo-link-hover': 'var(--color-global-typo-view-hover-accent)',
    '--color-scroll-bg': 'var(--color-global-border-view-default-secondary)',
    '--color-scroll-thumb': 'var(--color-global-border-view-default-primary)',
    '--color-scroll-thumb-hover': 'var(--color-global-border-view-hover-primary)',
    '--color-shadow-group-1': 'var(--color-global-surface-special-shadow)',
    '--color-shadow-group-2': 'var(--color-global-surface-special-shadow)',
    '--color-shadow-layer-1': 'var(--color-global-surface-special-shadow)',
    '--color-shadow-layer-2': 'var(--color-global-surface-special-shadow)',
    '--color-shadow-modal-1': 'var(--color-global-surface-special-shadow)',
    '--color-shadow-modal-2': 'var(--color-global-surface-special-shadow)',
    '--color-control-bg-default': 'var(--color-input-surface-view-default-primary)',
    '--color-control-typo-default': 'var(--color-input-typo-view-default-primary)',
    '--color-control-typo-placeholder': 'var(--color-input-typo-special-default-placeholder)',
    '--color-control-bg-border-default': 'var(--color-input-border-view-default-primary)',
    '--color-control-bg-border-default-hover': 'var(--color-input-border-view-hover-primary)',
    '--color-control-bg-border-focus': 'var(--color-global-border-state-focus)',
    '--color-control-bg-focus': 'var(--color-global-border-state-focus)',
    '--color-control-bg-active': 'var(--color-global-border-state-active-primary)',
    '--color-control-bg-primary': 'var(--color-control-surface-view-default-primary)',
    '--color-control-bg-primary-hover': 'var(--color-control-surface-view-hover-primary)',
    '--color-control-typo-primary': 'var(--color-control-typo-view-default-primary)',
    '--color-control-typo-primary-hover': 'var(--color-control-typo-view-hover-primary)',
    '--color-control-bg-secondary': 'var(--color-control-surface-view-default-secondary)',
    '--color-control-bg-border-secondary': 'var(--color-control-border-view-default-secondary)',
    '--color-control-bg-border-secondary-hover': 'var(--color-control-border-view-hover-secondary)',
    '--color-control-typo-secondary': 'var(--color-control-typo-view-default-secondary)',
    '--color-control-typo-secondary-hover': 'var(--color-control-typo-view-hover-secondary)',
    '--color-control-bg-ghost': 'var(--color-control-surface-view-default-ghost)',
    '--color-control-bg-ghost-hover': 'var(--color-control-surface-view-hover-ghost)',
    '--color-control-typo-ghost': 'var(--color-control-typo-view-default-ghost)',
    '--color-control-typo-ghost-hover': 'var(--color-control-typo-view-hover-ghost)',
    '--color-control-bg-clear': 'var(--color-control-surface-view-default-clear)',
    '--color-control-bg-clear-hover': 'var(--color-control-surface-view-hover-clear)',
    '--color-control-typo-clear': 'var(--color-control-typo-view-default-clear)',
    '--color-control-typo-clear-hover': 'var(--color-control-typo-view-hover-clear)',
    '--color-control-bg-disable': 'var(--color-control-surface-view-disabled-ghost)',
    '--color-control-bg-border-disable': 'var(--color-control-border-view-disabled-secondary)',
    '--color-control-typo-disable': 'var(--color-control-typo-view-disabled-primary)'
  }
};
const legacyBridgeKeys = Object.keys(legacyBridge);
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
      if (flags.addLegacyBridge) {
        cssFiles.map(fileName => {
          legacyBridgeKeys.map(key => {
            if (fileName.includes(`_${key}_`)) {
              themeJs[fileName] = _objectSpread(_objectSpread({}, themeJs[fileName]), legacyBridge[key]);
            }
          });
        });
      }
      await Promise.all(cssFiles.map(async fileName => {
        const outputPathDir = (0, _path.join)(flags.output);
        const outputPathFile = (0, _path.join)(outputPathDir, `${fileName}.css`);
        await (0, _fsExtra.ensureDir)(outputPathDir);
        if (await (0, _fsExtra.pathExists)(outputPathFile)) {
          await (0, _fsExtra.remove)(outputPathFile);
        }
        await (0, _fsExtra.writeFile)(outputPathFile, ObjectToCss(themeJs[fileName], fileName));
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
    description: 'The input path',
    default: undefined
  }),
  output: _command.flags.string({
    description: 'The output path',
    default: 'src/themes'
  }),
  modValuePrefix: _command.flags.string({
    description: 'Theme name',
    default: 'app'
  }),
  create: _command.flags.boolean({
    description: 'Create a new theme',
    default: false
  }),
  addLegacyBridge: _command.flags.boolean({
    description: 'Add legacy bridge',
    default: false
  })
};
GenerateCommand.run();
