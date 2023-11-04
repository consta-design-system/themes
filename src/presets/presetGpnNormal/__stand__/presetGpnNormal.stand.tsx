import { createStand } from '##/stand/standConfig';

export default createStand({
  title: 'presetGpnNormal',
  id: 'presetGpnNormal',
  group: 'presets',
  description: 'Пресет. Набор правил для темы дизайн системы.',
  version: '1.0.0',
  status: 'stable',
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
