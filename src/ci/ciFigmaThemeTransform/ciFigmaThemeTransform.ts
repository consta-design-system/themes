// Генератор CSS-тем из Design Tokens (DTCG 2025.10), выгруженных из Figma.
//
// Запуск в dev (babel компилирует .ts -> .js):
//   yarn theme:generate
// или вручную:
//   yarn babel src/ci/ciFigmaThemeTransform/ciFigmaThemeTransform.ts --out-file src/ci/ciFigmaThemeTransform/ciFigmaThemeTransform.js
//   node ./src/ci/ciFigmaThemeTransform/ciFigmaThemeTransform.js --path=./src/ci/ciFigmaThemeTransform/__mocks__/figmaExport --output=./src/theme --addLegacyBridge
//
// Флаг --addLegacyBridge:
//   * раскидывает переменные модификатора base по файлам других модификаторов
//     (ориентир — ключ сразу после "base": --base-border-* -> Theme_border_*.css);
//   * не создаёт файл модификатора base;
//   * добавляет мосты совместимости из папки --bridges в файлы своих модификаторов.
//
// Флаг --bridges=<path>: путь к папке с CSS-файлами мостов (<modifier>.css).
// Файл моста добавляется в тему, если существует, например color.css ->
// Theme_color_*.css. По умолчанию используется папка __mocks__/cssBridges.
//
// Флаг --clean: полностью очищает папку экспорта перед генерацией,
// чтобы удалить устаревшие файлы прошлых запусков.
//
// Принцип разбиения на файлы:
//   Первый сегмент пути — модификатор темы, последний сегмент — значение модификатора.
//   На каждую пару «модификатор + значение» создаётся отдельный CSS-файл.
//
//   Примеры:
//     base.border.width.1.default      -> Theme_base_default.css,  переменная --base-border-width-1
//     color.control.border.focus.light -> Theme_color_light.css,   переменная --color-control-border-focus
//
// Поддерживаемые типы:
//   color        { colorSpace, components, alpha, hex }        -> каналы -l/-c/-h/-a + oklch(var(-l) var(-c) var(-h) / var(-a))
//   dimension    { value, unit }                               -> "1px"
//   duration     { value, unit }                               -> "500ms"
//   cubicBezier  [a, b, c, d]                                  -> cubic-bezier(a, b, c, d)
//   fontFamily   ["Inter", "-apple-system", ...]               -> "Inter", -apple-system, ...
//   string                                                      -> строка как есть
//   number / fontWeight                                         -> число
//
// Любой тип может иметь значение-ссылку на другую переменную вида "{a.b.c}":
//   {base.border.width.1} -> var(--base-border-width-1)

import { Command, flags } from '@oclif/command';
import {
  copy,
  ensureDir,
  lstat,
  pathExists,
  readdir,
  readFile,
  readJSON,
  remove,
  writeFile,
} from 'fs-extra';
import { join } from 'path';

import { DownloadedGoogleFont, downloadGoogleFont } from './googleFonts';

export type ThemeJs = Record<string, Record<string, string>>;

const REFERENCE_REGEX = /^\{(.+)\}$/;

const toVarName = (path: string[]) => `--${path.join('-')}`;

const parseVarName = (path: string[]) => `--${path.slice(0, -1).join('-')}`;

const getFileName = (modifier: string, valueModifier: string) =>
  `Theme_${modifier}_${valueModifier}`;

/**
 * Возвращает путь ссылки "{a.b.c}" в виде "a.b.c" или null, если это не ссылка.
 */
const getReferencePath = (value: any): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const match = REFERENCE_REGEX.exec(value.trim());
  return match ? match[1] : null;
};

const quoteFontFamily = (font: string) => {
  // Имена с пробелами в font-family нужно брать в кавычки.
  if (/\s/.test(font)) {
    return `"${font}"`;
  }
  return font;
};

/**
 * Переменная считается «семейством шрифтов», если в её имени встречаются
 * и признак "typo", и признак "family". Примеры:
 *   --base-typo-family-primary, --typo-global-family-body и т.п.
 */
const isTypoFamilyVar = (varName: string) =>
  varName.includes('typo') && varName.includes('family');

/**
 * Достаёт первое имя семейства из значения font-family.
 * "Inter, -apple-system, ..." -> "Inter".
 * Ссылки вида "var(--…)" не являются литеральным списком — возвращаем null.
 */
const getFirstFontFamily = (value: string): string | null => {
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

/**
 * По значению переменной семейства шрифтов возвращает имя первого семейства.
 * Значение может быть прямым списком ("Inter, -apple-system, ...") либо ссылкой
 * вида "var(--base-typo-family-primary)" на другую переменную темы. Ссылки
 * разворачиваются через глобальный словарь переменных до тех пор, пока не будет
 * встречен литеральный список. Циклы и висячие ссылки приводят к null.
 */
const resolveFontFamily = (
  value: string,
  globalVars: Record<string, string>,
): string | null => {
  let current = value.trim();
  const seen = new Set<string>();

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

// Поддерживаемые расширения шрифтов и соответствующие им CSS-форматы.
const FONT_FORMATS: Record<string, string> = {
  woff2: 'woff2',
  woff: 'woff',
  ttf: 'truetype',
  otf: 'opentype',
};

type FontFile = { name: string; sourcePath: string };

const FONT_FILE_REGEX = /^(.+)-(\d+)\.(woff2|woff|ttf|otf)$/i;

/**
 * Рекурсивно ищет файлы шрифтов указанного семейства в папке fonts
 * и группирует их по весу. Имя файла вида "<Family>-<weight>.<ext>".
 * Поиск ведётся рекурсивно, поэтому шрифты могут лежать как прямо в папке,
 * так и в подпапке с именем семейства (например fonts/Inter/Inter-100.woff2).
 */
const collectFontFiles = async (
  fontsPath: string,
  family: string,
): Promise<Map<number, FontFile[]>> => {
  const result = new Map<number, FontFile[]>();

  if (!fontsPath || !(await pathExists(fontsPath))) {
    return result;
  }

  const walk = async (dir: string): Promise<void> => {
    const entries = await readdir(dir);
    const tasks = entries.map(async (entry) => {
      const fullPath = join(dir, entry);
      const stat = await lstat(fullPath);
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
        result.get(weight)!.push({ name: entry, sourcePath: fullPath });
      }
    });
    await Promise.all(tasks);
  };

  await walk(fontsPath);
  return result;
};

/**
 * Формирует блок @font-face для одного начертания:
 *   @font-face {
 *     font-family: Inter;
 *     src:
 *       url('Inter-100.woff2') format('woff2'),
 *       url('Inter-100.woff') format('woff');
 *     font-weight: 100;
 *     font-style: normal;
 *   }
 * Более современные форматы (woff2) идут первыми.
 */
const buildFontFace = (
  family: string,
  weight: number,
  files: FontFile[],
): string => {
  const sorted = [...files].sort((a, b) => {
    const extA = a.name.split('.').pop()!.toLowerCase();
    const extB = b.name.split('.').pop()!.toLowerCase();
    if (extA === extB) {
      return 0;
    }
    return extA === 'woff2' ? -1 : 1;
  });

  const src = sorted
    .map((file) => {
      const ext = file.name.split('.').pop()!.toLowerCase();
      const format = FONT_FORMATS[ext] || ext;
      return `    url('${file.name}') format('${format}')`;
    })
    .join(',\n');

  return [
    '@font-face {',
    `  font-family: ${family};`,
    `  src:\n${src};`,
    `  font-weight: ${weight};`,
    '  font-style: normal;',
    '}',
  ].join('\n');
};

/**
 * Формирует блок @font-face для скачанной из Google Fonts грани.
 * В отличие от локальных файлов, каждая грань соответствует одному подмножеству
 * глифов (latin, cyrillic и т.д.) и содержит unicode-range, поэтому на одну пару
 * «семейство + вес» может приходиться несколько блоков:
 *   @font-face {
 *     font-family: "Roboto Mono";
 *     font-style: normal;
 *     font-weight: 300;
 *     src: url('Roboto-Mono-300-latin.woff2') format('woff2');
 *     unicode-range: U+0000-00FF, ...;
 *   }
 */
const buildSubsetFontFace = (
  family: string,
  font: DownloadedGoogleFont,
): string => {
  // Более современные форматы (woff2) идут первыми, за ними — woff-fallback.
  const sources = [`    url('${font.fileName}') format('woff2')`];
  if (font.woffFileName) {
    sources.push(`    url('${font.woffFileName}') format('woff')`);
  }

  const lines = [
    '@font-face {',
    `  font-family: ${quoteFontFamily(family)};`,
    `  font-style: ${font.style};`,
    `  font-weight: ${font.weight};`,
    `  src:\n${sources.join(',\n')};`,
  ];
  if (font.unicodeRange) {
    lines.push(`  unicode-range: ${font.unicodeRange};`);
  }
  lines.push('}');
  return lines.join('\n');
};

/**
 * Преобразует значение токена в CSS-значение.
 * Ссылки вида "{a.b.c}" превращаются в var(--a-b-c).
 */
const resolveValue = ($type: string, $value: any): string => {
  // Строка: либо ссылка на другую переменную, либо литеральное значение.
  if (typeof $value === 'string') {
    const match = REFERENCE_REGEX.exec($value.trim());
    if (match) {
      return `var(--${match[1].split('.').join('-')})`;
    }
    return $value;
  }

  // Число (number, fontWeight, а также raw-значения без единиц).
  if (typeof $value === 'number') {
    return `${$value}`;
  }

  // Массив: cubic-bezier или font-family.
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
    // Цвет (color): { colorSpace, components, alpha, hex }.
    // Сохраняем в oklch(), всегда указывая альфа-канал.
    if (Array.isArray($value.components)) {
      const [lightness, chroma, hue] = $value.components;
      const alpha = $value.alpha !== undefined ? $value.alpha : 1;
      return `oklch(${lightness} ${chroma} ${hue} / ${alpha})`;
    }
    if (typeof $value.hex === 'string') {
      return $value.hex;
    }

    // Размерность и длительность (dimension / duration): { value, unit }.
    if ($value.value !== undefined) {
      const unit = $value.unit || '';
      return `${$value.value}${unit}`;
    }
  }

  return `${$value}`;
};

/**
 * Раскладывает цвет на CSS-переменные каналов -l/-c/-h/-a и собирает итоговую
 * переменную в oklch(). Если значение — ссылка на другую переменную {a.b.c},
 * каналы тоже ссылаются на каналы целевой переменной (…-l/-c/-h/-a).
 */
const setColorCssVariables = (
  themeJs: ThemeJs,
  fileName: string,
  varName: string,
  $value: any,
) => {
  const referencePath = getReferencePath($value);

  let lightness: string;
  let chroma: string;
  let hue: string;
  let alpha: string;

  if (referencePath) {
    const targetVar = toVarName(referencePath.split('.'));
    lightness = `var(${targetVar}-l)`;
    chroma = `var(${targetVar}-c)`;
    hue = `var(${targetVar}-h)`;
    alpha = `var(${targetVar}-a)`;
  } else if (
    $value &&
    typeof $value === 'object' &&
    Array.isArray($value.components)
  ) {
    lightness = `${$value.components[0]}`;
    chroma = `${$value.components[1]}`;
    hue = `${$value.components[2]}`;
    alpha = `${$value.alpha !== undefined ? $value.alpha : 1}`;
  } else {
    // Нестандартный цвет — fallback через общий резолвер.
    themeJs[fileName][varName] = resolveValue('color', $value);
    return;
  }

  themeJs[fileName][`${varName}-l`] = lightness;
  themeJs[fileName][`${varName}-c`] = chroma;
  themeJs[fileName][`${varName}-h`] = hue;
  themeJs[fileName][`${varName}-a`] = alpha;
  themeJs[fileName][
    varName
  ] = `oklch(var(${varName}-l) var(${varName}-c) var(${varName}-h) / var(${varName}-a))`;
};

/**
 * Рекурсивно обходит дерево токенов. Токеном считается узел с ключом "$type".
 * Первый сегмент пути — модификатор темы, последний — значение модификатора.
 */
const collectTokens = (node: any, path: string[], themeJs: ThemeJs) => {
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

    Object.keys(node).forEach((key) => {
      collectTokens(node[key], [...path, key], themeJs);
    });
  }
};

/**
 * Достаёт имя модификатора из имени файла темы.
 * "Theme_color_light" -> "color".
 */
const getModifier = (fileName: string) =>
  fileName.replace(/^Theme_/, '').replace(/_[^_]+$/, '');

/**
 * Читает CSS-файл моста совместимости для модификатора из папки bridges.
 * Файл должен называться "<modifier>.css" и содержать объявления вида:
 *   --color-bg-default: var(--color-global-surface-view-default-primary);
 * Возвращает словарь объявлений или null, если файла нет / путь не задан.
 */
const readBridgeFile = async (
  bridgesPath: string | undefined,
  modifier: string,
): Promise<Record<string, string> | null> => {
  if (!bridgesPath) {
    return null;
  }

  const bridgeFile = join(bridgesPath, `${modifier}.css`);

  if (!(await pathExists(bridgeFile))) {
    return null;
  }

  const content = await readFile(bridgeFile, 'utf8');
  const declarations: Record<string, string> = {};

  // Извлекаем все объявления вида "--name: value;" независимо от обёртки
  // (:root { … }), комментариев и переносов строк.
  const declarationRegex = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let match: RegExpExecArray | null;

  while ((match = declarationRegex.exec(content)) !== null) {
    const value = match[2].trim();
    if (value) {
      declarations[match[1]] = value;
    }
  }

  return declarations;
};

/**
 * Раскидывает переменные модификатора base по файлам других модификаторов.
 * Ориентир — ключ сразу после "base": --base-border-* -> Theme_border_*.css,
 * --base-color-* -> Theme_color_*.css и т.д. Сам файл Theme_base_*.css в этом
 * режиме не создаётся — он удаляется вызывающим кодом после распределения.
 */
const distributeBaseVars = (themeJs: ThemeJs) => {
  const files = Object.keys(themeJs);
  const baseFile = files.find((f) => f.startsWith('Theme_base_'));

  if (!baseFile) {
    return;
  }

  const prefix = '--base-';

  Object.keys(themeJs[baseFile]).forEach((varName) => {
    if (!varName.startsWith(prefix)) {
      return;
    }

    const rest = varName.slice(prefix.length);
    const group = rest.split('-')[0];

    files
      .filter(
        (fileName) =>
          fileName !== baseFile && fileName.startsWith(`Theme_${group}_`),
      )
      .forEach((fileName) => {
        themeJs[fileName][varName] = themeJs[baseFile][varName];
      });
  });
};

const ObjectToCss = (obj: Record<string, string>, name: string) =>
  `.${name}{` +
  `\n${Object.keys(obj)
    .map((key) => `${key}: ${obj[key]};`)
    .join('\n')}` +
  `\n}`;

class GenerateCommand extends Command {
  async run() {
    const hrStart = process.hrtime();
    const { flags } = this.parse<CiFlags, {}>(GenerateCommand as any);

    this.log(`generating theme in ${flags.path} ...`);

    try {
      const data = await readJSON(join(flags.path, flags.file));

      this.log(`parsing ${flags.file} ...`);

      const themeJs: ThemeJs = {};
      collectTokens(data, [], themeJs);

      if (flags.addLegacyBridge) {
        // Раскидываем base-переменные по файлам соответствующих модификаторов.
        distributeBaseVars(themeJs);
        // Файл модификатора base в этом режиме не создаём —
        // его переменные уже попали в файлы своих групп.
        Object.keys(themeJs)
          .filter((fileName) => fileName.startsWith('Theme_base_'))
          .forEach((fileName) => {
            delete themeJs[fileName];
          });
      }

      const cssFiles = Object.keys(themeJs);

      this.log(`detected theme files: ${cssFiles.join(', ')}`);

      if (flags.addLegacyBridge) {
        // Добавляем мосты совместимости из файлов папки bridges
        // (для каждого модификатора — если такой файл существует).
        const modifiers = [...new Set(cssFiles.map(getModifier))];
        await Promise.all(
          modifiers.map(async (modifier) => {
            const bridge = await readBridgeFile(flags.bridges, modifier);
            if (!bridge) {
              return;
            }
            cssFiles
              .filter((fileName) => getModifier(fileName) === modifier)
              .forEach((fileName) => {
                themeJs[fileName] = {
                  ...themeJs[fileName],
                  ...bridge,
                };
              });
          }),
        );
      }

      // При необходимости полностью очищаем папку экспорта,
      // чтобы удалить устаревшие файлы прошлых запусков.
      const outputPathDir = join(flags.output);
      await ensureDir(outputPathDir);

      if (flags.clean) {
        const existing = await readdir(outputPathDir);
        await Promise.all(
          existing.map(async (entry) => {
            const entryPath = join(outputPathDir, entry);
            if (await pathExists(entryPath)) {
              await remove(entryPath);
            }
          }),
        );
      }

      // Собираем @font-face для всех модификаторов, где объявлены переменные
      // семейства шрифтов (в имени переменной есть и "typo", и "family").
      // Шрифты копируются в подпапку того модификатора, где объявлена
      // переменная, а блоки @font-face добавляются в начало CSS этого файла.
      const fontFacesByFile: Record<string, string> = {};

      // Глобальный словарь всех переменных тем — нужен для разворачивания
      // ссылок вида var(--base-typo-family-primary) в литеральные списки
      // семейств при определении имени семейства шрифта.
      const globalVars: Record<string, string> = {};
      Object.keys(themeJs).forEach((fileName) => {
        Object.assign(globalVars, themeJs[fileName]);
      });

      await Promise.all(
        cssFiles.map(async (fileName) => {
          const declarations = themeJs[fileName];
          const families = new Set<string>();

          Object.keys(declarations).forEach((varName) => {
            if (!isTypoFamilyVar(varName)) {
              return;
            }
            const family = resolveFontFamily(declarations[varName], globalVars);
            if (family) {
              families.add(family);
            }
          });

          if (families.size === 0) {
            return;
          }

          // Шрифты модификатора кладём в его собственную подпапку экспорта,
          // рядом с CSS-файлом, который на них ссылается.
          const modifier = getModifier(fileName);
          const fontOutputDir = join(outputPathDir, `_${modifier}`);
          await ensureDir(fontOutputDir);
          const copiedFonts = new Set<string>();

          const familyList = [...families];
          const blocksResults = await Promise.all(
            familyList.map(async (family) => {
              const faces: string[] = [];
              const copyTasks: Array<Promise<void>> = [];

              const filesByWeight = await collectFontFiles(flags.fonts, family);

              if (filesByWeight.size === 0) {
                // Локальных файлов шрифта нет — пробуем скачать из Google Fonts,
                // сохранить в папку fonts (кэш) и использовать для @font-face.
                let downloaded: DownloadedGoogleFont[] = [];
                try {
                  downloaded = await downloadGoogleFont(family, flags.fonts);
                } catch (err) {
                  this.log(
                    `failed to download font "${family}" from Google Fonts: ${
                      err instanceof Error ? err.message : err
                    }`,
                  );
                }
                downloaded.forEach((font) => {
                  faces.push(buildSubsetFontFace(family, font));
                  const filesToCopy: Array<{
                    name: string;
                    sourcePath: string;
                  }> = [{ name: font.fileName, sourcePath: font.sourcePath }];
                  if (font.woffFileName && font.woffSourcePath) {
                    filesToCopy.push({
                      name: font.woffFileName,
                      sourcePath: font.woffSourcePath,
                    });
                  }
                  filesToCopy.forEach(({ name, sourcePath }) => {
                    if (copiedFonts.has(name)) {
                      return;
                    }
                    copiedFonts.add(name);
                    copyTasks.push(copy(sourcePath, join(fontOutputDir, name)));
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
                files.forEach((file) => {
                  if (copiedFonts.has(file.name)) {
                    return;
                  }
                  copiedFonts.add(file.name);
                  copyTasks.push(
                    copy(file.sourcePath, join(fontOutputDir, file.name)),
                  );
                });
              });

              await Promise.all(copyTasks);
              return faces;
            }),
          );

          const blocks: string[] = [];
          blocksResults.forEach((faces) => {
            blocks.push(...faces);
          });

          if (blocks.length > 0) {
            fontFacesByFile[fileName] = blocks.join('\n\n');
          }
        }),
      );

      if (Object.keys(fontFacesByFile).length > 0) {
        this.log(
          `generated @font-face for: ${Object.keys(fontFacesByFile).join(
            ', ',
          )}`,
        );
      }

      await Promise.all(
        cssFiles.map(async (fileName) => {
          // Раскладываем выходные CSS по подпапкам модификаторов:
          // Theme_color_light.css -> _color/Theme_color_light.css.
          const modifierDir = join(outputPathDir, `_${getModifier(fileName)}`);
          await ensureDir(modifierDir);

          const outputPathFile = join(modifierDir, `${fileName}.css`);
          if (await pathExists(outputPathFile)) {
            await remove(outputPathFile);
          }

          const css = fontFacesByFile[fileName]
            ? `${fontFacesByFile[fileName]}\n\n${ObjectToCss(
                themeJs[fileName],
                fileName,
              )}`
            : ObjectToCss(themeJs[fileName], fileName);

          await writeFile(outputPathFile, css);
        }),
      );
    } catch (err) {
      this.error(err as any);
    }

    const hrEnd = process.hrtime(hrStart);

    this.log(`${flags.path} is transformed!`);

    this.log(`Execution time: ${hrEnd[0]}s`);
  }
}

GenerateCommand.flags = {
  path: flags.string({
    description: 'The input path',
    default: undefined,
  }),
  file: flags.string({
    description: 'The input file name',
    default: 'consta-neo.tokens.json',
  }),
  output: flags.string({
    description: 'The output path',
    default: 'src/theme',
  }),
  bridges: flags.string({
    description: 'Path to the folder with CSS bridge files (<modifier>.css)',
    // Путь указывается относительно файла скрипта (__dirname),
    // чтобы не зависеть от директории запуска.
    default: join(__dirname, 'cssBridges'),
  }),
  fonts: flags.string({
    description:
      'Path to the folder with font files (searched for @font-face generation)',
    // Папка шрифтов: по умолчанию <скрипт>/fonts. Внутри могут лежать как
    // файлы напрямую, так и подпапки с именами семейств (fonts/Inter/...).
    default: join(__dirname, 'fonts'),
  }),
  addLegacyBridge: flags.boolean({
    description: 'Add legacy bridge and distribute base variables',
    default: false,
  }),
  clean: flags.boolean({
    description: 'Clean the export directory before generation',
    default: false,
  }),
};

type CiFlags = {
  path: string;
  file: string;
  output: string;
  bridges: string;
  fonts: string;
  addLegacyBridge: boolean;
  clean: boolean;
};

GenerateCommand.run();
