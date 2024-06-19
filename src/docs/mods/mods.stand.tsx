import { createStand } from '##/stand/standConfig';

export default createStand({
  title: 'Модификаторы темы',
  id: 'mods',
  group: 'docs',
  description: 'Модификаторы темы. Части правил для темы дизайн системы.',
  alias: [
    'тема',
    'контейнер',
    'цвет',
    'цвета',
    'отступ',
    'отступы',
    'размер',
    'размеры',
    'тень',
    'тени',
  ],
  order: 10,
});
