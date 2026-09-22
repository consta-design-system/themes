// Скачивание шрифтов из Google Fonts, если они не найдены в локальной папке fonts.
//
// Работает через CSS2 API: https://fonts.googleapis.com/css2?family=<Family>:wght@100;…;900
// Формат файла зависит от браузерного User-Agent: современный браузер получает woff2,
// более старый (без поддержки woff2) — woff, не браузер — ttf. Поэтому делаются два
// запроса: один с современным UA (woff2), второй — со старым (woff). Скачиваются оба
// формата, чтобы в @font-face можно было указать fallback для старых браузеров.
// Запрашивается дискретный список весов и начертаний (0 = normal, 1 = italic):
// Google возвращает только реально существующие грани (для вариативных шрифтов —
// диапазоном "100 700", для статических — по одному блоку на вес/стиль). Диапазон-
// ось wght@100..900 здесь не используется, т.к. для шрифтов с максимальным весом
// меньше 900 он возвращает ошибку 400.
//
// Если у шрифта нет курсива/oblique — вернутся только normal-грани, и браузер при
// font-style: italic сам синтезирует наклон из normal-грани (faux italic). Если же
// курсив существует — скачается настоящий, и @font-face получит нужный font-style.
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

// Старый браузер без поддержки woff2 — Google Fonts вернёт woff (fallback).
const OLD_BROWSER_UA =
  'Mozilla/5.0 (Windows NT 6.1; rv:20.0) Gecko/20100101 Firefox/20.0';

// Дискретные веса и начертания (0 = normal, 1 = italic), которые охватывают
// типичные начертания темы. Google возвращает только те, что реально существуют
// у шрифта: если курсива нет — вернутся только normal-грани.
const WEIGHTS =
  'ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;' +
  '1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900';

export type GoogleFontFace = {
  weight: string;
  style: string;
  subset: string;
  unicodeRange: string;
  url: string;
  // URL woff-fallback для того же веса/стиля/подмножества (если доступен).
  woffUrl?: string;
};

export type DownloadedGoogleFont = GoogleFontFace & {
  fileName: string;
  sourcePath: string;
  woffFileName?: string;
  woffSourcePath?: string;
};

/**
 * GET-запрос и возврат тела ответа как Buffer.
 */
const fetchBuffer = (url: string, ua: string): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    httpsGet(url, { headers: { 'User-Agent': ua } }, (res) => {
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

const fetchText = async (url: string, ua: string): Promise<string> =>
  (await fetchBuffer(url, ua)).toString('utf8');

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
 * Находит семейство в Google Fonts: сначала пробует имя как есть, затем —
 * humanized вариант ("source-code-pro" -> "Source Code Pro"). Возвращает список
 * граней (woff2) и имя кандидата, который сработал.
 */
const resolveFaces = async (
  candidates: string[],
  toUrl: (candidate: string) => string,
): Promise<{
  faces: GoogleFontFace[];
  candidate?: string;
  lastError?: Error;
}> => {
  let lastError: Error | undefined;

  // Последовательный ретрай по кандидатам имени — await в цикле уместен.
  /* eslint-disable no-await-in-loop */
  for (const candidate of candidates) {
    try {
      const parsed = parseGoogleFontCss(
        await fetchText(toUrl(candidate), BROWSER_UA),
      );
      if (parsed.length > 0) {
        return { faces: parsed, candidate };
      }
    } catch (err) {
      lastError = err as Error;
    }
  }

  return { faces: [], lastError };
};

/**
 * Дополняет woff2-грани woff-fallback. Старый UA отдаёт woff одним файлом на
 * «вес|стиль», покрывающим все подмножества глифов и без unicode-range. Поэтому
 * сначала пробуем точное совпадение «вес|стиль|подмножество», затем — общее для
 * «вес|стиль». Если старый UA вернул пустой список или запрос упал — woff не
 * прикрепляется (fallback остаётся только woff2).
 */
const attachWoffFallback = async (
  faces: GoogleFontFace[],
  woffCssUrl: string,
): Promise<GoogleFontFace[]> => {
  try {
    const woffFaces = parseGoogleFontCss(
      await fetchText(woffCssUrl, OLD_BROWSER_UA),
    );
    const woffBySubset = new Map<string, string>();
    const woffByWeight = new Map<string, string>();
    woffFaces.forEach((face) => {
      woffBySubset.set(`${face.weight}|${face.style}|${face.subset}`, face.url);
      if (!woffByWeight.has(`${face.weight}|${face.style}`)) {
        woffByWeight.set(`${face.weight}|${face.style}`, face.url);
      }
    });
    return faces.map((face) => {
      const woffUrl =
        woffBySubset.get(`${face.weight}|${face.style}|${face.subset}`) ||
        woffByWeight.get(`${face.weight}|${face.style}`);
      return woffUrl ? { ...face, woffUrl } : face;
    });
  } catch {
    // woff — опциональный fallback; игнорируем ошибку загрузки CSS.
    return faces;
  }
};

/**
 * Скачивает все начертания семейства из Google Fonts в папку <fonts>/<Family>/.
 * Для каждого веса/подмножества скачиваются woff2 (современный браузер) и, если
 * доступен, woff (fallback для старых браузеров). Файлы сохраняются рядом.
 * Если шрифт уже частично или полностью скачан, файлы всё равно перезаписываются —
 * это гарантирует актуальность после обновления шрифта на стороне Google.
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

  const {
    faces: woff2Faces,
    candidate,
    lastError,
  } = await resolveFaces(candidates, toUrl);

  if (woff2Faces.length === 0) {
    throw new Error(
      `no @font-face rules returned for "${family}"${
        lastError ? ` (${lastError.message})` : ''
      }`,
    );
  }

  const faces = candidate
    ? await attachWoffFallback(woff2Faces, toUrl(candidate))
    : woff2Faces;

  const dir = join(fontsPath, family);
  await ensureDir(dir);

  const prefix = slugify(family);

  // Старый UA отдаёт один woff-файл на «вес|стиль» (полное покрытие глифов),
  // поэтому скачиваем его один раз и переиспользуем для всех подмножеств.
  const woffKeyOf = (face: GoogleFontFace) => `${face.weight}|${face.style}`;
  const uniqueWoff = [
    ...new Map(
      faces
        .filter((face) => face.woffUrl)
        .map((face) => [woffKeyOf(face), face]),
    ).values(),
  ];

  const woffByKey = new Map<string, { fileName: string; sourcePath: string }>();
  await Promise.all(
    uniqueWoff.map(async (face) => {
      const fileName = `${prefix}-${slugify(face.weight)}-${slugify(
        face.style,
      )}.woff`;
      const sourcePath = join(dir, fileName);
      const buffer = await fetchBuffer(face.woffUrl!, OLD_BROWSER_UA);
      await writeFile(sourcePath, buffer);
      woffByKey.set(woffKeyOf(face), { fileName, sourcePath });
    }),
  );

  const downloaded = await Promise.all(
    faces.map(async (face) => {
      const woff2Buffer = await fetchBuffer(face.url, BROWSER_UA);
      // Стиль в имени обязателен: normal и italic одного веса/подмножества
      // иначе перезаписали бы друг друга одним файлом.
      const fileName = `${prefix}-${slugify(face.weight)}-${slugify(
        face.style,
      )}-${face.subset}.woff2`;
      const sourcePath = join(dir, fileName);
      await writeFile(sourcePath, woff2Buffer);

      const result: DownloadedGoogleFont = { ...face, fileName, sourcePath };

      const woff = woffByKey.get(woffKeyOf(face));
      if (woff) {
        result.woffFileName = woff.fileName;
        result.woffSourcePath = woff.sourcePath;
      }

      return result;
    }),
  );

  return downloaded;
};
