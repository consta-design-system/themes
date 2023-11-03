import { createConfig, ListCardList } from '@consta/stand';

import image from './ConstaImage.png';
import { StandPageDecoration as standPageDecoration } from './standPageDecoration';

export const { createStand } = createConfig({
  title: 'Consta UI Kit',
  id: 'uikit',
  groups: [
    {
      title: 'Документация',
      id: 'about',
    },
    {
      title: 'Пресеты',
      id: 'presets',
      renderList: ListCardList,
    },
  ],
  group: 'Библиотеки',
  image,
  description: 'Библиотека статусных тем',
  standPageDecoration,
  repositoryUrl: 'https://github.com/consta-design-system/themes',
  figmaUrl: 'https://www.figma.com/file/elVbeup31NtoDiJo3DoRa3',
  order: 1,
  standTabs: [
    // табы по умолчанию
    { id: '', label: 'Обзор' },
    { id: 'dev', label: 'Разработчикам' },
    { id: 'design', label: 'Дизайнерам', figma: true },
    { id: 'sandbox', label: 'Песочница', sandbox: true },
    // свои табы
    { id: 'use', label: 'Как использовать' },
  ],
});
