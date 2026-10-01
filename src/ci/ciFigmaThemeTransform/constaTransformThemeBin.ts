#!/usr/bin/env node

// Точка входа CLI, доступная пользователю после установки пакета.
// Этот файл компилируется сборкой build:js (babel) в
// dist/ci/ciFigmaThemeTransform/bin.js и автоматически попадает
// в опубликованный пакет по пути из поля "bin" в package.json:
//   "consta-theme-transform": "ci/ciFigmaThemeTransform/bin.js"
//
// Скомпилированный код ciFigmaThemeTransform лежит рядом — в той же папке:
//   dist/ci/ciFigmaThemeTransform/ciFigmaThemeTransform.js
require('./ciFigmaThemeTransform.js').runCli();

// Файл обязан быть модулем (tsconfig включает isolatedModules),
// поэтому добавляем пустой экспорт. На runtime не влияет.
export {};
