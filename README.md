# Пингборд

[![Проверки и сборка](https://github.com/DenisDudyrew/pingboard/actions/workflows/desktop.yml/badge.svg?branch=main)](https://github.com/DenisDudyrew/pingboard/actions/workflows/desktop.yml)

Пингборд — настольная канбан-доска для рабочих задач и личных планов. Задачи и настройки хранятся локально в SQLite. Для работы с доской не нужен аккаунт.

## Скачать и установить

1. Откройте [GitHub Releases](https://github.com/DenisDudyrew/pingboard/releases) и скачайте файл `Pingboard-<версия>-macOS-Apple-Silicon.dmg` из раздела Assets.
2. Откройте DMG и перетащите Pingboard в «Программы».
3. Запустите Pingboard из Finder. При настройке первого напоминания разрешите уведомления macOS.

Установщик предназначен для Mac с Apple Silicon.

## Что умеет Пингборд

- Карточки с заметками, цветными метками и чек-листами.
- Перетаскивание между колонками «В планах», «В работе» и «Готово».
- Поиск по названию, заметке и меткам, фильтры «Работа» и «Личное».
- Экран «Сегодня» с просроченными задачами, сроками на сегодня и ближайшей будущей задачей.
- Системные напоминания macOS по срокам задач. При переносе срока приложение обновляет напоминание, при завершении или удалении отменяет его.

## Разработка

Интерфейс использует React, TypeScript и Vite. Настольное окно и доступ к SQLite реализованы на Tauri и Rust, напоминания — на Swift.

На Mac понадобятся Node.js 24, Rust с Cargo и инструменты командной строки Xcode.

```sh
npm ci
cargo install tauri-cli --version '^2' --locked
npm start
```

| Команда | Назначение |
| --- | --- |
| `npm test` | Собрать интерфейс и проверить логику доски, напоминаний и SQLite |
| `npm run test:ui` | Запустить браузерный тест интерфейса после `npx playwright-core install chromium` |
| `npm run test:macos` | Проверить системные напоминания в тестовом приложении с разрешёнными уведомлениями |
| `npm run build` | Собрать приложение и DMG в `src-tauri/target/release/bundle/` |

## CI/CD и выпуск версий

[GitHub Actions](https://github.com/DenisDudyrew/pingboard/actions) запускает тесты и собирает DMG для pull request и изменений в `main`. Для выпуска обновите версию в `package.json`, `package-lock.json`, `src-tauri/Cargo.toml` и `src-tauri/tauri.conf.json`. После успешной сборки из `main` GitHub публикует новую версию с установщиком и `SHA256SUMS.txt`. Повторная сборка версии доступна в артефактах Actions.
