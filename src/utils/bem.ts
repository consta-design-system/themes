import { withNaming } from '@bem-react/classname';

const reactBemNaming = { n: 'themes--', e: '-', m: '_', v: '_' };

export const cn = withNaming(reactBemNaming);

export const withPrefix = (prefix: string) =>
  withNaming({ ...reactBemNaming, n: prefix + reactBemNaming.n });

export const cnCanary = withPrefix('canary');

export const cnDeprecated = withPrefix('deprecated');
