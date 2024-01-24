# [Дизайн-система Consta](http://consta.design/) | Themes

Набор статусных тем, для компнентов дизайн системы.

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

### Можно использовать компоненты

Например, так:

```js
import { Theme } from '@consta/uikit/Theme';
import { Button } from '@consta/uikit/Button';
import { presetGpnAlert } from '@consta/themes/preset-alert';
const App = () => {
  return (
    <Theme preset={presetGpnAlert}>
      <Button />
    </Theme>
  );
};
```

## Документация

[Посмотреть документацию и примеры](http://consta.design/libs/header)

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
