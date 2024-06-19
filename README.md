# [Дизайн-система Consta](http://consta.design/) | Themes

Набор тем, для дизайн системы.

# Как использовать

## Установите пакет

```sh
# NPM
$ npm install @consta/themes
# Yarn
$ yarn add @consta/themes
```

## Подключите зависимости

Чтобы начать работу, установите библиотеку [`@consta/uikit`](https://www.npmjs.com/package/@consta/uikit) и [настройте тему](http://consta.design/libs/portal/theme-themeabout).

### Использование

Например, так:

```ts
import { presetGpnDefault, ThemePreset } from '@consta/uikit/Theme';
import '@consta/themes/Theme_color_highlightsRedDark';
import '@consta/themes/Theme_color_highlightsRedDefault';

const myPreset: ThemePreset = {
  ...presetGpnDefault,
  color: {
    primary: 'highlightsRedDefault',
    invert: 'highlightsRedDark',
    accent: 'highlightsRedDark',
  },
};

const App = () => {
  return <Theme preset={myPreset}>your code</Theme>;
};
```

## Документация

[Посмотреть документацию и примеры](http://consta.design/libs/themes)

## Разработка

### Подготовка окружения

Рабочее окружение должно содержать NodeJS и Yarn.

Чтобы установить зависимости, выполните команду:

```sh
$ yarn install
```

### Основные команды

```sh
# Запуск локального сервера для разработки
$ yarn start

# Сборка пакета
$ yarn build

# Сборка стенда
$ yarn stand:build

# Запуск тестов
$ yarn test

# Создание реекспортов для модификаторов темы (запускать после изменении модификаторов)
$ yarn pre-build
```

## Контрибьюторам

Будем рады, если вы захотите принять участие в разработке дизайн-системы =) Но сначала прочитайте [инструкцию для контрибьюторов](https://consta.design/libs/portal/contributers-code).

## Лицензия

Дизайн-систему можно использовать бесплатно, она распространяется на условиях открытой [лицензии MIT](https://consta.design/static/licence_mit.pdf).
