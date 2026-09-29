#!/usr/bin/env node

// Точка входа CLI, доступная пользователю после установки пакета.
// Выполняется уже скомпилированный код из dist/.
require('../dist/ci/ciFigmaThemeTransform/ciFigmaThemeTransform.js').runCli();
