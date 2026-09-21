"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.parseGoogleFontCss = exports.downloadGoogleFont = void 0;
var _defineProperty2 = _interopRequireDefault(require("@babel/runtime/helpers/defineProperty"));
var _fsExtra = require("fs-extra");
var _https = require("https");
var _path = require("path");
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { (0, _defineProperty2.default)(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const WEIGHTS = 'wght@100;200;300;400;500;600;700;800;900';
const fetchBuffer = url => new Promise((resolve, reject) => {
  (0, _https.get)(url, {
    headers: {
      'User-Agent': BROWSER_UA
    }
  }, res => {
    var _res$statusCode;
    const code = (_res$statusCode = res.statusCode) !== null && _res$statusCode !== void 0 ? _res$statusCode : 0;
    if (code !== 200) {
      res.resume();
      reject(new Error(`HTTP ${code} for ${url}`));
      return;
    }
    const chunks = [];
    res.on('data', chunk => chunks.push(chunk));
    res.on('end', () => resolve(Buffer.concat(chunks)));
  }).on('error', reject);
});
const fetchText = async url => (await fetchBuffer(url)).toString('utf8');
const extractDeclaration = (body, regex) => {
  const match = regex.exec(body);
  return match ? match[1].trim() : undefined;
};
const parseGoogleFontCss = css => {
  const result = [];
  const seen = new Set();
  const blockRe = /@font-face\s*\{([\s\S]*?)\}/g;
  let match;
  while ((match = blockRe.exec(css)) !== null) {
    const body = match[1];
    const srcUrl = extractDeclaration(body, /src:\s*url\(['"]?([^)'"]+)['"]?\)/);
    if (!srcUrl) {
      continue;
    }
    const before = css.slice(0, match.index);
    const commentMatch = /\/\*\s*([\w-]+)\s*\*\/\s*$/.exec(before);
    const subset = commentMatch ? commentMatch[1] : 'fallback';
    const weight = extractDeclaration(body, /font-weight:\s*([^;]+);/) || '400';
    const style = extractDeclaration(body, /font-style:\s*([^;]+);/) || 'normal';
    const unicodeRange = extractDeclaration(body, /unicode-range:\s*([^;]+);/) || '';
    const key = `${weight}|${style}|${subset}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push({
      weight,
      style,
      subset,
      unicodeRange,
      url: srcUrl
    });
  }
  return result;
};
exports.parseGoogleFontCss = parseGoogleFontCss;
const slugify = value => value.replace(/\s+/g, '-');
const humanizeFamilyName = value => value.split('-').filter(Boolean).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
const downloadGoogleFont = async (family, fontsPath) => {
  const trimmed = family.trim();
  const candidates = [trimmed, humanizeFamilyName(trimmed)];
  const toUrl = candidate => `https://fonts.googleapis.com/css2?family=${encodeURIComponent(candidate).replace(/%20/g, '+')}:${WEIGHTS}&display=swap`;
  let faces = [];
  let lastError = null;
  for (const candidate of candidates) {
    try {
      const parsed = parseGoogleFontCss(await fetchText(toUrl(candidate)));
      if (parsed.length > 0) {
        faces = parsed;
        break;
      }
    } catch (err) {
      lastError = err;
    }
  }
  if (faces.length === 0) {
    throw new Error(`no @font-face rules returned for "${family}"${lastError ? ` (${lastError.message})` : ''}`);
  }
  const dir = (0, _path.join)(fontsPath, family);
  await (0, _fsExtra.ensureDir)(dir);
  const prefix = slugify(family);
  const downloaded = await Promise.all(faces.map(async face => {
    const buffer = await fetchBuffer(face.url);
    const fileName = `${prefix}-${slugify(face.weight)}-${face.subset}.woff2`;
    const sourcePath = (0, _path.join)(dir, fileName);
    await (0, _fsExtra.writeFile)(sourcePath, buffer);
    return _objectSpread(_objectSpread({}, face), {}, {
      fileName,
      sourcePath
    });
  }));
  return downloaded;
};
exports.downloadGoogleFont = downloadGoogleFont;
