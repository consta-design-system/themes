"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");
var _defineProperty2 = _interopRequireDefault(require("@babel/runtime/helpers/defineProperty"));
var _command = require("@oclif/command");
var _fsExtra = require("fs-extra");
var _path = require("path");
var _googleFonts = require("./googleFonts");
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { (0, _defineProperty2.default)(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
const REFERENCE_REGEX = /^\{(.+)\}$/;
const toVarName = path => `--${path.join('-')}`;
const parseVarName = path => `--${path.slice(0, -1).join('-')}`;
const getFileName = (modifier, valueModifier) => `Theme_${modifier}_${valueModifier}`;
const getReferencePath = value => {
  if (typeof value !== 'string') {
    return null;
  }
  const match = REFERENCE_REGEX.exec(value.trim());
  return match ? match[1] : null;
};
const quoteFontFamily = font => {
  if (/\s/.test(font)) {
    return `"${font}"`;
  }
  return font;
};
const isTypoFamilyVar = varName => varName.includes('typo') && varName.includes('family');
const getFirstFontFamily = value => {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('var(')) {
    return null;
  }
  const first = trimmed.split(',')[0].trim();
  if (!first) {
    return null;
  }
  return first.replace(/^["']|["']$/g, '');
};
const resolveFontFamily = (value, globalVars) => {
  let current = value.trim();
  const seen = new Set();
  while (current.startsWith('var(')) {
    const match = /^var\((--[\w-]+)\)$/.exec(current);
    if (!match || seen.has(match[1])) {
      return null;
    }
    seen.add(match[1]);
    const next = globalVars[match[1]];
    if (next === undefined) {
      return null;
    }
    current = next.trim();
  }
  return getFirstFontFamily(current);
};
const FONT_FORMATS = {
  woff2: 'woff2',
  woff: 'woff',
  ttf: 'truetype',
  otf: 'opentype'
};
const FONT_FILE_REGEX = /^(.+)-(\d+)\.(woff2|woff|ttf|otf)$/i;
const collectFontFiles = async (fontsPath, family) => {
  const result = new Map();
  if (!fontsPath || !(await (0, _fsExtra.pathExists)(fontsPath))) {
    return result;
  }
  const walk = async dir => {
    const entries = await (0, _fsExtra.readdir)(dir);
    const tasks = entries.map(async entry => {
      const fullPath = (0, _path.join)(dir, entry);
      const stat = await (0, _fsExtra.lstat)(fullPath);
      if (stat.isDirectory()) {
        await walk(fullPath);
        return;
      }
      const match = FONT_FILE_REGEX.exec(entry);
      if (match && match[1] === family) {
        const weight = Number(match[2]);
        if (!result.has(weight)) {
          result.set(weight, []);
        }
        result.get(weight).push({
          name: entry,
          sourcePath: fullPath
        });
      }
    });
    await Promise.all(tasks);
  };
  await walk(fontsPath);
  return result;
};
const buildFontFace = (family, weight, files) => {
  const sorted = [...files].sort((a, b) => {
    const extA = a.name.split('.').pop().toLowerCase();
    const extB = b.name.split('.').pop().toLowerCase();
    if (extA === extB) {
      return 0;
    }
    return extA === 'woff2' ? -1 : 1;
  });
  const src = sorted.map(file => {
    const ext = file.name.split('.').pop().toLowerCase();
    const format = FONT_FORMATS[ext] || ext;
    return `    url('${file.name}') format('${format}')`;
  }).join(',\n');
  return ['@font-face {', `  font-family: ${family};`, `  src:\n${src};`, `  font-weight: ${weight};`, '  font-style: normal;', '}'].join('\n');
};
const buildSubsetFontFace = (family, font) => {
  const sources = [`    url('${font.fileName}') format('woff2')`];
  if (font.woffFileName) {
    sources.push(`    url('${font.woffFileName}') format('woff')`);
  }
  const lines = ['@font-face {', `  font-family: ${quoteFontFamily(family)};`, `  font-style: ${font.style};`, `  font-weight: ${font.weight};`, `  src:\n${sources.join(',\n')};`];
  if (font.unicodeRange) {
    lines.push(`  unicode-range: ${font.unicodeRange};`);
  }
  lines.push('}');
  return lines.join('\n');
};
const resolveValue = ($type, $value) => {
  if (typeof $value === 'string') {
    const match = REFERENCE_REGEX.exec($value.trim());
    if (match) {
      return `var(--${match[1].split('.').join('-')})`;
    }
    return $value;
  }
  if (typeof $value === 'number') {
    return `${$value}`;
  }
  if (Array.isArray($value)) {
    if ($type === 'cubicBezier') {
      return `cubic-bezier(${$value.join(',')})`;
    }
    if ($type === 'fontFamily') {
      return $value.map(quoteFontFamily).join(', ');
    }
    return $value.join(', ');
  }
  if ($value && typeof $value === 'object') {
    if (Array.isArray($value.components)) {
      const [lightness, chroma, hue] = $value.components;
      const alpha = $value.alpha !== undefined ? $value.alpha : 1;
      return `oklch(${lightness} ${chroma} ${hue} / ${alpha})`;
    }
    if (typeof $value.hex === 'string') {
      return $value.hex;
    }
    if ($value.value !== undefined) {
      const unit = $value.unit || '';
      return `${$value.value}${unit}`;
    }
  }
  return `${$value}`;
};
const setColorCssVariables = (themeJs, fileName, varName, $value) => {
  const referencePath = getReferencePath($value);
  let lightness;
  let chroma;
  let hue;
  let alpha;
  if (referencePath) {
    const targetVar = toVarName(referencePath.split('.'));
    lightness = `var(${targetVar}-l)`;
    chroma = `var(${targetVar}-c)`;
    hue = `var(${targetVar}-h)`;
    alpha = `var(${targetVar}-a)`;
  } else if ($value && typeof $value === 'object' && Array.isArray($value.components)) {
    lightness = `${$value.components[0]}`;
    chroma = `${$value.components[1]}`;
    hue = `${$value.components[2]}`;
    alpha = `${$value.alpha !== undefined ? $value.alpha : 1}`;
  } else {
    themeJs[fileName][varName] = resolveValue('color', $value);
    return;
  }
  themeJs[fileName][`${varName}-l`] = lightness;
  themeJs[fileName][`${varName}-c`] = chroma;
  themeJs[fileName][`${varName}-h`] = hue;
  themeJs[fileName][`${varName}-a`] = alpha;
  themeJs[fileName][varName] = `oklch(var(${varName}-l) var(${varName}-c) var(${varName}-h) / var(${varName}-a))`;
};
const collectTokens = (node, path, themeJs) => {
  if (node && typeof node === 'object') {
    if ('$type' in node) {
      const modifier = path[0];
      const valueModifier = path[path.length - 1];
      const fileName = getFileName(modifier, valueModifier);
      const varName = parseVarName(path);
      if (!themeJs[fileName]) {
        themeJs[fileName] = {};
      }
      if (node.$type === 'color') {
        setColorCssVariables(themeJs, fileName, varName, node.$value);
      } else {
        themeJs[fileName][varName] = resolveValue(node.$type, node.$value);
      }
      return;
    }
    Object.keys(node).forEach(key => {
      collectTokens(node[key], [...path, key], themeJs);
    });
  }
};
const getModifier = fileName => fileName.replace(/^Theme_/, '').replace(/_[^_]+$/, '');
const readBridgeFile = async (bridgesPath, modifier) => {
  if (!bridgesPath) {
    return null;
  }
  const bridgeFile = (0, _path.join)(bridgesPath, `${modifier}.css`);
  if (!(await (0, _fsExtra.pathExists)(bridgeFile))) {
    return null;
  }
  const content = await (0, _fsExtra.readFile)(bridgeFile, 'utf8');
  const declarations = {};
  const declarationRegex = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let match;
  while ((match = declarationRegex.exec(content)) !== null) {
    const value = match[2].trim();
    if (value) {
      declarations[match[1]] = value;
    }
  }
  return declarations;
};
const distributeBaseVars = themeJs => {
  const files = Object.keys(themeJs);
  const baseFile = files.find(f => f.startsWith('Theme_base_'));
  if (!baseFile) {
    return;
  }
  const prefix = '--base-';
  Object.keys(themeJs[baseFile]).forEach(varName => {
    if (!varName.startsWith(prefix)) {
      return;
    }
    const rest = varName.slice(prefix.length);
    const group = rest.split('-')[0];
    files.filter(fileName => fileName !== baseFile && fileName.startsWith(`Theme_${group}_`)).forEach(fileName => {
      themeJs[fileName][varName] = themeJs[baseFile][varName];
    });
  });
};
const ObjectToCss = (obj, name) => `.${name}{` + `\n${Object.keys(obj).map(key => `${key}: ${obj[key]};`).join('\n')}` + `\n}`;
class GenerateCommand extends _command.Command {
  async run() {
    const hrStart = process.hrtime();
    const {
      flags
    } = this.parse(GenerateCommand);
    this.log(`generating theme in ${flags.path} ...`);
    try {
      const data = await (0, _fsExtra.readJSON)((0, _path.join)(flags.path, flags.file));
      this.log(`parsing ${flags.file} ...`);
      const themeJs = {};
      collectTokens(data, [], themeJs);
      if (flags.addLegacyBridge) {
        distributeBaseVars(themeJs);
        Object.keys(themeJs).filter(fileName => fileName.startsWith('Theme_base_')).forEach(fileName => {
          delete themeJs[fileName];
        });
      }
      const cssFiles = Object.keys(themeJs);
      this.log(`detected theme files: ${cssFiles.join(', ')}`);
      if (flags.addLegacyBridge) {
        const modifiers = [...new Set(cssFiles.map(getModifier))];
        await Promise.all(modifiers.map(async modifier => {
          const bridge = await readBridgeFile(flags.bridges, modifier);
          if (!bridge) {
            return;
          }
          cssFiles.filter(fileName => getModifier(fileName) === modifier).forEach(fileName => {
            themeJs[fileName] = _objectSpread(_objectSpread({}, themeJs[fileName]), bridge);
          });
        }));
      }
      const outputPathDir = (0, _path.join)(flags.output);
      await (0, _fsExtra.ensureDir)(outputPathDir);
      if (flags.clean) {
        const existing = await (0, _fsExtra.readdir)(outputPathDir);
        await Promise.all(existing.map(async entry => {
          const entryPath = (0, _path.join)(outputPathDir, entry);
          if (await (0, _fsExtra.pathExists)(entryPath)) {
            await (0, _fsExtra.remove)(entryPath);
          }
        }));
      }
      const fontFacesByFile = {};
      const copiedFonts = new Set();
      const fontOutputDir = (0, _path.join)(outputPathDir, '_typo');
      await (0, _fsExtra.ensureDir)(fontOutputDir);
      await Promise.all(cssFiles.map(async fileName => {
        if (getModifier(fileName) !== 'typo') {
          return;
        }
        const declarations = themeJs[fileName];
        const families = new Set();
        Object.keys(declarations).forEach(varName => {
          if (!isTypoFamilyVar(varName)) {
            return;
          }
          const family = getFirstFontFamily(declarations[varName]);
          if (family) {
            families.add(family);
          }
        });
        const familyList = [...families];
        const blocksResults = await Promise.all(familyList.map(async family => {
          const faces = [];
          const copyTasks = [];
          const filesByWeight = await collectFontFiles(flags.fonts, family);
          if (filesByWeight.size === 0) {
            let downloaded = [];
            try {
              downloaded = await (0, _googleFonts.downloadGoogleFont)(family, flags.fonts);
            } catch (err) {
              this.log(`failed to download font "${family}" from Google Fonts: ${err instanceof Error ? err.message : err}`);
            }
            downloaded.forEach(font => {
              faces.push(buildSubsetFontFace(family, font));
              const filesToCopy = [{
                name: font.fileName,
                sourcePath: font.sourcePath
              }];
              if (font.woffFileName && font.woffSourcePath) {
                filesToCopy.push({
                  name: font.woffFileName,
                  sourcePath: font.woffSourcePath
                });
              }
              filesToCopy.forEach(({
                name,
                sourcePath
              }) => {
                if (copiedFonts.has(name)) {
                  return;
                }
                copiedFonts.add(name);
                copyTasks.push((0, _fsExtra.copy)(sourcePath, (0, _path.join)(fontOutputDir, name)));
              });
            });
            if (downloaded.length > 0) {
              this.log(`downloaded "${family}" from Google Fonts`);
            }
            await Promise.all(copyTasks);
            return faces;
          }
          filesByWeight.forEach((files, weight) => {
            faces.push(buildFontFace(family, weight, files));
            files.forEach(file => {
              if (copiedFonts.has(file.name)) {
                return;
              }
              copiedFonts.add(file.name);
              copyTasks.push((0, _fsExtra.copy)(file.sourcePath, (0, _path.join)(fontOutputDir, file.name)));
            });
          });
          await Promise.all(copyTasks);
          return faces;
        }));
        const blocks = [];
        blocksResults.forEach(faces => {
          blocks.push(...faces);
        });
        if (blocks.length > 0) {
          fontFacesByFile[fileName] = blocks.join('\n\n');
        }
      }));
      if (Object.keys(fontFacesByFile).length > 0) {
        this.log(`generated @font-face for: ${Object.keys(fontFacesByFile).join(', ')}`);
      }
      await Promise.all(cssFiles.map(async fileName => {
        const modifierDir = (0, _path.join)(outputPathDir, `_${getModifier(fileName)}`);
        await (0, _fsExtra.ensureDir)(modifierDir);
        const outputPathFile = (0, _path.join)(modifierDir, `${fileName}.css`);
        if (await (0, _fsExtra.pathExists)(outputPathFile)) {
          await (0, _fsExtra.remove)(outputPathFile);
        }
        const css = fontFacesByFile[fileName] ? `${fontFacesByFile[fileName]}\n\n${ObjectToCss(themeJs[fileName], fileName)}` : ObjectToCss(themeJs[fileName], fileName);
        await (0, _fsExtra.writeFile)(outputPathFile, css);
      }));
    } catch (err) {
      this.error(err);
    }
    const hrEnd = process.hrtime(hrStart);
    this.log(`${flags.path} is transformed!`);
    this.log(`Execution time: ${hrEnd[0]}s`);
  }
}
GenerateCommand.flags = {
  path: _command.flags.string({
    description: 'The input path',
    default: undefined
  }),
  file: _command.flags.string({
    description: 'The input file name',
    default: 'consta-neo.tokens.json'
  }),
  output: _command.flags.string({
    description: 'The output path',
    default: 'src/theme'
  }),
  bridges: _command.flags.string({
    description: 'Path to the folder with CSS bridge files (<modifier>.css)',
    default: (0, _path.join)(__dirname, 'cssBridges')
  }),
  fonts: _command.flags.string({
    description: 'Path to the folder with font files (searched for @font-face generation)',
    default: (0, _path.join)(__dirname, 'fonts')
  }),
  addLegacyBridge: _command.flags.boolean({
    description: 'Add legacy bridge and distribute base variables',
    default: false
  }),
  clean: _command.flags.boolean({
    description: 'Clean the export directory before generation',
    default: false
  })
};
GenerateCommand.run();
