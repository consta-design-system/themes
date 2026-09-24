import { lstat, mkdtemp, readdir, readFile, remove } from 'fs-extra';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  type ThemeJs,
  buildFontFace,
  collectTokens,
  distributeBaseVars,
  generateTheme,
  getReferencePath,
  ObjectToCss,
  resolveFontFamily,
  resolveValue,
  setColorCssVariables,
} from '../ciFigmaThemeTransform';

const ROOT = join(__dirname, '..');
const MOCK_TOKENS = join(ROOT, '__mocks__', 'figmaExport');
const BRIDGES = join(ROOT, 'cssBridges');
const FONTS = join(ROOT, 'fonts');
const EXPECTED_EXPORT = join(ROOT, '__mocks__', 'cssExport');

const toRelative = (dir: string, full: string) =>
  full
    .split(join(dir, ''))
    .pop()!
    .replace(/^[/\\]/, '');

/** Рекурсивно собирает относительные пути файлов внутри директории. */
const collectRelativeFiles = async (dir: string): Promise<string[]> => {
  const out: string[] = [];
  const walk = async (current: string): Promise<void> => {
    const entries = await readdir(current);
    await Promise.all(
      entries.map(async (entry) => {
        const full = join(current, entry);
        const stat = await lstat(full);
        if (stat.isDirectory()) {
          await walk(full);
        } else {
          out.push(toRelative(dir, full));
        }
      }),
    );
  };
  await walk(dir);
  return out.sort();
};

const readCss = (dir: string, rel: string) => readFile(join(dir, rel), 'utf8');

describe('generateTheme (интеграция)', () => {
  let outDir: string;

  beforeEach(async () => {
    outDir = await mkdtemp(join(tmpdir(), 'ci-figma-theme-'));
  });

  afterEach(async () => {
    await remove(outDir);
  });

  it('воспроизводит эталонный __mocks__/cssExport (addLegacyBridge)', async () => {
    await generateTheme(
      {
        path: MOCK_TOKENS,
        file: 'consta-neo.tokens.json',
        output: outDir,
        bridges: BRIDGES,
        fonts: FONTS,
        addLegacyBridge: true,
        clean: false,
      },
      () => undefined,
    );

    // Одинаковый набор файлов: CSS + скопированные шрифты.
    const actualFiles = await collectRelativeFiles(outDir);
    const expectedFiles = await collectRelativeFiles(EXPECTED_EXPORT);
    expect(actualFiles).toEqual(expectedFiles);

    // Содержимое каждого CSS-файла совпадает с эталоном.
    const cssFiles = actualFiles.filter((f) => f.endsWith('.css'));
    expect(cssFiles.length).toBeGreaterThan(0);

    const pairs = await Promise.all(
      cssFiles.map(async (rel) => ({
        rel,
        actual: await readCss(outDir, rel),
        expected: await readCss(EXPECTED_EXPORT, rel),
      })),
    );

    pairs.forEach(({ rel, actual, expected }) => {
      expect(actual).toBe(expected);
    });
  }, 120000);

  it('без addLegacyBridge не раскидывает base и не добавляет мосты', async () => {
    await generateTheme(
      {
        path: MOCK_TOKENS,
        file: 'consta-neo.tokens.json',
        output: outDir,
        bridges: BRIDGES,
        fonts: FONTS,
        addLegacyBridge: false,
        clean: false,
      },
      () => undefined,
    );

    const files = await collectRelativeFiles(outDir);
    // Есть файл модификатора base.
    expect(files.some((f) => f.includes('Theme_base_'))).toBe(true);
    // Мосты не подмешаны: в Theme_color_light.css нет старых bridge-переменных.
    const colorLight = files.find((f) => f.endsWith('Theme_color_light.css'))!;
    const css = await readCss(outDir, colorLight);
    expect(css).not.toContain('--color-bg-default');
  }, 120000);
});

describe('resolveValue', () => {
  it('превращает ссылку {a.b.c} в var(--a-b-c)', () => {
    expect(resolveValue('dimension', '{base.space.m}')).toBe(
      'var(--base-space-m)',
    );
  });

  it('число возвращает строкой', () => {
    expect(resolveValue('fontWeight', 700)).toBe('700');
  });

  it('cubicBezier собирает cubic-bezier(...)', () => {
    expect(resolveValue('cubicBezier', [0.2, 0, 0, 1])).toBe(
      'cubic-bezier(0.2,0,0,1)',
    );
  });

  it('fontFamily берёт имена в кавычки при наличии пробела', () => {
    expect(resolveValue('fontFamily', ['Inter', 'Roboto Mono'])).toBe(
      'Inter, "Roboto Mono"',
    );
  });

  it('dimension добавляет единицу', () => {
    expect(resolveValue('dimension', { value: 16, unit: 'px' })).toBe('16px');
  });

  it('duration добавляет единицу', () => {
    expect(resolveValue('duration', { value: 500, unit: 'ms' })).toBe('500ms');
  });

  it('цвет без каналов возвращает hex', () => {
    expect(resolveValue('color', { hex: '#ffffff' })).toBe('#ffffff');
  });

  it('строковый тип переносится как есть', () => {
    expect(resolveValue('string', 'opacity-50')).toBe('opacity-50');
  });
});

describe('getReferencePath', () => {
  it('распознаёт ссылку {a.b.c}', () => {
    expect(getReferencePath('{base.space.m}')).toBe('base.space.m');
  });

  it('возвращает null для литерала', () => {
    expect(getReferencePath('16px')).toBeNull();
    expect(getReferencePath(123)).toBeNull();
  });
});

describe('setColorCssVariables', () => {
  it('раскладывает цвет на каналы -l/-c/-h/-a и oklch()', () => {
    const theme: ThemeJs = { Theme_color_light: {} };
    setColorCssVariables(theme, 'Theme_color_light', '--color-blue-500', {
      colorSpace: 'oklch',
      components: [0.5, 0.2, 250],
      alpha: 0.8,
    });

    expect(theme.Theme_color_light).toEqual({
      '--color-blue-500-l': '0.5',
      '--color-blue-500-c': '0.2',
      '--color-blue-500-h': '250',
      '--color-blue-500-a': '0.8',
      '--color-blue-500':
        'oklch(var(--color-blue-500-l) var(--color-blue-500-c) var(--color-blue-500-h) / var(--color-blue-500-a))',
    });
  });

  it('для ссылки {a.b.c} каналы ссылаются на каналы цели', () => {
    const theme: ThemeJs = { Theme_color_light: {} };
    setColorCssVariables(
      theme,
      'Theme_color_light',
      '--color-foo',
      '{base.foo}',
    );
    expect(theme.Theme_color_light['--color-foo-l']).toBe('var(--base-foo-l)');
  });
});

describe('distributeBaseVars', () => {
  it('раскидывает --base-* по файлам групп и оставляет сам base', () => {
    const theme: ThemeJs = {
      Theme_base_default: {
        '--base-space-m': '16px',
        '--base-border-width-1': '1px',
      },
      Theme_space_default: { '--space-m': 'var(--base-space-m)' },
      Theme_border_default: {},
    };

    distributeBaseVars(theme);

    expect(theme.Theme_space_default['--base-space-m']).toBe('16px');
    expect(theme.Theme_border_default['--base-border-width-1']).toBe('1px');
    expect(theme.Theme_base_default['--base-space-m']).toBe('16px');
  });
});

describe('collectTokens', () => {
  it('группирует токены по файлам модификаторов', () => {
    const theme: ThemeJs = {};
    collectTokens(
      {
        space: {
          m: {
            default: {
              $type: 'dimension',
              $value: { value: 16, unit: 'px' },
            },
          },
        },
      },
      [],
      theme,
    );

    expect(theme.Theme_space_default).toEqual({
      '--space-m': '16px',
    });
  });
});

describe('buildFontFace', () => {
  it('ставит woff2 первым и формирует src', () => {
    const block = buildFontFace('Inter', 400, [
      { name: 'Inter-400.woff', sourcePath: '/x/Inter-400.woff' },
      { name: 'Inter-400.woff2', sourcePath: '/x/Inter-400.woff2' },
    ]);

    expect(block).toBe(`@font-face {
  font-family: Inter;
  src:
    url('Inter-400.woff2') format('woff2'),
    url('Inter-400.woff') format('woff');
  font-weight: 400;
  font-style: normal;
}`);
  });
});

describe('resolveFontFamily', () => {
  it('разворачивает цепочку ссылок до литерального списка', () => {
    const vars = {
      '--base-typo-family-primary': 'var(--typo-family)',
      '--typo-family': 'Inter, -apple-system, sans-serif',
    };
    expect(resolveFontFamily('var(--base-typo-family-primary)', vars)).toBe(
      'Inter',
    );
  });

  it('возвращает null при цикле ссылок', () => {
    const vars = {
      '--a': 'var(--b)',
      '--b': 'var(--a)',
    };
    expect(resolveFontFamily('var(--a)', vars)).toBeNull();
  });

  it('возвращает null для висячей ссылки', () => {
    expect(resolveFontFamily('var(--missing)', {})).toBeNull();
  });
});

describe('ObjectToCss', () => {
  it('формирует класс с объявлениями переменных', () => {
    expect(ObjectToCss({ '--space-m': '16px' }, 'Theme_space_default')).toBe(
      `.Theme_space_default{
--space-m: 16px;
}`,
    );
  });
});
