import { parseGoogleFontCss } from '../googleFonts';

describe('parseGoogleFontCss', () => {
  it('парсит normal и italic грани одного веса/подмножества без потерь', () => {
    const css = `
      /* latin */
      @font-face {
        font-family: 'Inter';
        font-style: normal;
        font-weight: 400;
        src: url(https://fonts.gstatic.com/s/inter/normal-400-latin.woff2) format('woff2');
        unicode-range: U+0000-00FF;
      }
      /* latin */
      @font-face {
        font-family: 'Inter';
        font-style: italic;
        font-weight: 400;
        src: url(https://fonts.gstatic.com/s/inter/italic-400-latin.woff2) format('woff2');
        unicode-range: U+0000-00FF;
      }
    `;

    const faces = parseGoogleFontCss(css);

    expect(faces).toHaveLength(2);
    const normal = faces.find((f) => f.style === 'normal');
    const italic = faces.find((f) => f.style === 'italic');

    expect(normal).toMatchObject({
      weight: '400',
      style: 'normal',
      subset: 'latin',
      unicodeRange: 'U+0000-00FF',
    });
    expect(italic).toMatchObject({
      weight: '400',
      style: 'italic',
      subset: 'latin',
      unicodeRange: 'U+0000-00FF',
    });
    // Уникальные URL на каждую грань (стиль не должен теряться).
    expect(normal!.url).not.toBe(italic!.url);
  });

  it('дедуплицирует грани по паре вес|стиль|подмножество', () => {
    const css = `
      /* cyrillic */
      @font-face {
        font-style: italic;
        font-weight: 700;
        src: url(https://example.com/italic-700-cyrillic.woff2) format('woff2');
      }
      /* cyrillic */
      @font-face {
        font-style: italic;
        font-weight: 700;
        src: url(https://example.com/italic-700-cyrillic-dup.woff2) format('woff2');
      }
    `;

    const faces = parseGoogleFontCss(css);

    expect(faces).toHaveLength(1);
    expect(faces[0]).toMatchObject({
      weight: '700',
      style: 'italic',
      subset: 'cyrillic',
    });
  });

  it('по умолчанию подставляет normal, если font-style не задан', () => {
    const css = `
      /* latin-ext */
      @font-face {
        font-weight: 300;
        src: url(https://example.com/default-300.woff2) format('woff2');
      }
    `;

    const faces = parseGoogleFontCss(css);

    expect(faces).toHaveLength(1);
    expect(faces[0].style).toBe('normal');
  });
});
