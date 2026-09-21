// Скачивание шрифтов из Google Fonts, если они не найдены в локальной папке fonts.
//
// Работает через CSS2 API: https://fonts.googleapis.com/css2?family=<Family>:wght@100;…;900
// С полным браузерным User-Agent API отдаёт woff2 (без него — ttf). Запрашивается
// дискретный список весов: Google возвращает только существующие начертания
// (для вариативных шрифтов — диапазоном "100 700", для статических — по одному блоку
// на вес). Диапазон-ось wght@100..900 здесь не используется, т.к. для шрифтов с
// максимальным весом меньше 900 он возвращает ошибку 400.
//
// Каждый блок @font-face соответствует одному подмножеству глифов
// (latin, cyrillic, latin-ext и т.д.) и содержит unicode-range, поэтому скачанные
// файлы сохраняются с именем подмножества.
//
// Результат пишется в папку <fonts>/<Family>/, чтобы повторные запуски не ходили
// в сеть (кэширование), а сам генератор копировал файлы в выходную папку темы.

import { ensureDir, writeFile } from 'fs-extra';
import { get as httpsGet } from 'https';
import { join } from 'path';

// UA должен быть браузерным, иначе Google Fonts отдаст ttf вместо woff2.
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// Дискретные веса, которые охватывают типичные начертания темы.
// Google возвращает только те, что реально существуют у шрифта.
const WEIGHTS = 'wght@100;200;300;400;500;600;700;800;900';

export type GoogleFontFace = {
  weight: string;
  style: string;
  subset: string;
  unicodeRange: string;
  url: string;
};

export type DownloadedGoogleFont = GoogleFontFace & {
  fileName: string;
  sourcePath: string;
};

/**
 * GET-запрос и возврат тела ответа как Buffer.
 */
const fetchBuffer = (url: string): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    httpsGet(url, { headers: { 'User-Agent': BROWSER_UA } }, (res) => {
      const code = res.statusCode ?? 0;
      if (code !== 200) {
        res.resume();
        reject(new Error(`HTTP ${code} for ${url}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });

const fetchText = async (url: string): Promise<string> =>
  (await fetchBuffer(url)).toString('utf8');

/**
 * Достаёт значение объявления из тела @font-face.
 */
const extractDeclaration = (
  body: string,
  regex: RegExp,
): string | undefined => {
  const match = regex.exec(body);
  return match ? match[1].trim() : undefined;
};

/**
 * Парсит CSS-ответ Google Fonts в список граней.
 * Подмножество определяется по комментарию вида "/* latin *\/" перед @font-face.
 */
export const parseGoogleFontCss = (css: string): GoogleFontFace[] => {
  const result: GoogleFontFace[] = [];
  const seen = new Set<string>();

  const blockRe = /@font-face\s*\{([\s\S]*?)\}/g;
  let match: RegExpExecArray | null;

  while ((match = blockRe.exec(css)) !== null) {
    const body = match[1];
    const srcUrl = extractDeclaration(
      body,
      /src:\s*url\(['"]?([^)'"]+)['"]?\)/,
    );
    if (!srcUrl) {
      continue;
    }

    // Подмножество — последний комментарий перед блоком ("/* latin *\/").
    const before = css.slice(0, match.index);
    const commentMatch = /\/\*\s*([\w-]+)\s*\*\/\s*$/.exec(before);
    const subset = commentMatch ? commentMatch[1] : 'fallback';

    const weight = extractDeclaration(body, /font-weight:\s*([^;]+);/) || '400';
    const style =
      extractDeclaration(body, /font-style:\s*([^;]+);/) || 'normal';
    const unicodeRange =
      extractDeclaration(body, /unicode-range:\s*([^;]+);/) || '';

    const key = `${weight}|${style}|${subset}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    result.push({ weight, style, subset, unicodeRange, url: srcUrl });
  }

  return result;
};

/**
 * Приводит строку к безопасному имени файла без пробелов.
 */
const slugify = (value: string): string => value.replace(/\s+/g, '-');

/**
 * Преобразует "source-code-pro" в каноническое имя Google Fonts "Source Code Pro".
 * Имена в токенах часто приходят в kebab-case, тогда как Google ожидает Title Case
 * с пробелами.
 */
const humanizeFamilyName = (value: string): string =>
  value
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

/**
 * Скачивает все начертания семейства из Google Fonts в папку <fonts>/<Family>/.
 * Сначала пробует запросить имя как есть, затем — humanized вариант
 * ("source-code-pro" -> "Source Code Pro"). Если шрифт уже частично или полностью
 * скачан, файлы всё равно перезаписываются — это гарантирует актуальность после
 * обновления шрифта на стороне Google.
 */
export const downloadGoogleFont = async (
  family: string,
  fontsPath: string,
): Promise<DownloadedGoogleFont[]> => {
  const trimmed = family.trim();
  const candidates = [trimmed, humanizeFamilyName(trimmed)];

  // Пробелы в имени семейства Google Fonts принимает только как "+",
  // а encodeURIComponent превращает пробел в "%20", поэтому делаем замену.
  const toUrl = (candidate: string) =>
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(
      candidate,
    ).replace(/%20/g, '+')}:${WEIGHTS}&display=swap`;

  let faces: GoogleFontFace[] = [];
  let lastError: Error | null = null;

  // Последовательный ретрай по кандидатам имени — await в цикле уместен.
  for (const candidate of candidates) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const parsed = parseGoogleFontCss(await fetchText(toUrl(candidate)));
      if (parsed.length > 0) {
        faces = parsed;
        break;
      }
    } catch (err) {
      lastError = err as Error;
    }
  }

  if (faces.length === 0) {
    throw new Error(
      `no @font-face rules returned for "${family}"${
        lastError ? ` (${lastError.message})` : ''
      }`,
    );
  }

  const dir = join(fontsPath, family);
  await ensureDir(dir);

  const prefix = slugify(family);

  const downloaded = await Promise.all(
    faces.map(async (face) => {
      const buffer = await fetchBuffer(face.url);
      const fileName = `${prefix}-${slugify(face.weight)}-${face.subset}.woff2`;
      const sourcePath = join(dir, fileName);
      await writeFile(sourcePath, buffer);
      return { ...face, fileName, sourcePath };
    }),
  );

  return downloaded;
};
