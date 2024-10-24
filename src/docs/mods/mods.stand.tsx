import { createStand } from '##/stand/standConfig';

export default createStand({
  title: 'Модификаторы темы',
  id: 'mods',
  group: 'docs',
  description: 'Инструменты для гибкой настройки визуального оформления темы.',
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
