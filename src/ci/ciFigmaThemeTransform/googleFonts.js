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
const OLD_BROWSER_UA = 'Mozilla/5.0 (Windows NT 6.1; rv:20.0) Gecko/20100101 Firefox/20.0';
const WEIGHTS = 'ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;' + '1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900';
const fetchBuffer = (url, ua) => new Promise((resolve, reject) => {
  (0, _https.get)(url, {
    headers: {
      'User-Agent': ua
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
const fetchText = async (url, ua) => (await fetchBuffer(url, ua)).toString('utf8');
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
const resolveFaces = async (candidates, toUrl) => {
  let lastError;
  for (const candidate of candidates) {
    try {
      const parsed = parseGoogleFontCss(await fetchText(toUrl(candidate), BROWSER_UA));
      if (parsed.length > 0) {
        return {
          faces: parsed,
          candidate
        };
      }
    } catch (err) {
      lastError = err;
    }
  }
  return {
    faces: [],
    lastError
  };
};
const attachWoffFallback = async (faces, woffCssUrl) => {
  try {
    const woffFaces = parseGoogleFontCss(await fetchText(woffCssUrl, OLD_BROWSER_UA));
    const woffBySubset = new Map();
    const woffByWeight = new Map();
    woffFaces.forEach(face => {
      woffBySubset.set(`${face.weight}|${face.style}|${face.subset}`, face.url);
      if (!woffByWeight.has(`${face.weight}|${face.style}`)) {
        woffByWeight.set(`${face.weight}|${face.style}`, face.url);
      }
    });
    return faces.map(face => {
      const woffUrl = woffBySubset.get(`${face.weight}|${face.style}|${face.subset}`) || woffByWeight.get(`${face.weight}|${face.style}`);
      return woffUrl ? _objectSpread(_objectSpread({}, face), {}, {
        woffUrl
      }) : face;
    });
  } catch {
    return faces;
  }
};
const downloadGoogleFont = async (family, fontsPath) => {
  const trimmed = family.trim();
  const candidates = [trimmed, humanizeFamilyName(trimmed)];
  const toUrl = candidate => `https://fonts.googleapis.com/css2?family=${encodeURIComponent(candidate).replace(/%20/g, '+')}:${WEIGHTS}&display=swap`;
  const {
    faces: woff2Faces,
    candidate,
    lastError
  } = await resolveFaces(candidates, toUrl);
  if (woff2Faces.length === 0) {
    throw new Error(`no @font-face rules returned for "${family}"${lastError ? ` (${lastError.message})` : ''}`);
  }
  const faces = candidate ? await attachWoffFallback(woff2Faces, toUrl(candidate)) : woff2Faces;
  const dir = (0, _path.join)(fontsPath, family);
  await (0, _fsExtra.ensureDir)(dir);
  const prefix = slugify(family);
  const woffKeyOf = face => `${face.weight}|${face.style}`;
  const uniqueWoff = [...new Map(faces.filter(face => face.woffUrl).map(face => [woffKeyOf(face), face])).values()];
  const woffByKey = new Map();
  await Promise.all(uniqueWoff.map(async face => {
    const fileName = `${prefix}-${slugify(face.weight)}-${slugify(face.style)}.woff`;
    const sourcePath = (0, _path.join)(dir, fileName);
    const buffer = await fetchBuffer(face.woffUrl, OLD_BROWSER_UA);
    await (0, _fsExtra.writeFile)(sourcePath, buffer);
    woffByKey.set(woffKeyOf(face), {
      fileName,
      sourcePath
    });
  }));
  const downloaded = await Promise.all(faces.map(async face => {
    const woff2Buffer = await fetchBuffer(face.url, BROWSER_UA);
    const fileName = `${prefix}-${slugify(face.weight)}-${slugify(face.style)}-${face.subset}.woff2`;
    const sourcePath = (0, _path.join)(dir, fileName);
    await (0, _fsExtra.writeFile)(sourcePath, woff2Buffer);
    const result = _objectSpread(_objectSpread({}, face), {}, {
      fileName,
      sourcePath
    });
    const woff = woffByKey.get(woffKeyOf(face));
    if (woff) {
      result.woffFileName = woff.fileName;
      result.woffSourcePath = woff.sourcePath;
    }
    return result;
  }));
  return downloaded;
};
exports.downloadGoogleFont = downloadGoogleFont;
