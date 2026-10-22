# Локальные аккаунты, админка, ручной SQL и Excel: план

> Дополнение к [основному плану](2026-10-22-query-constructor.md). Всё во фронтенде, `server/` не меняем.

**Goal:** Демо-режим без сервера: локальные учётные записи (вход, регистрация, профиль), админка пользователей, ручной SQL на демо-базах, экспорт в `.xlsx`.

**Tech Stack:** React 19, Vite, `sql.js` (SQLite в браузере, подгружается лениво), `fflate` (zip для xlsx), `vitest`.

## Global Constraints

- Серверный код не менять. Пароли только хэшем (SHA-256 с солью через `crypto.subtle`), открытым текстом нигде не хранить.
- Хранилище: `localStorage`, ключ `qc_accounts`. Все функции принимают необязательный последний аргумент `storage` (по умолчанию `globalThis.localStorage`) для тестов.
- Интерфейс на русском, дизайн по `theme.css` (хвойная гамма, плоские листы).
- Токен локального пользователя: строка `local:<логин>` в `localStorage.token`. Токен сервера (JWT) работает как раньше.
- Демо-данные: админ `admin` / `admin123`, сотрудники с паролем `user123`.

## Задачи

1. **`client/src/constructor/export.js` и тесты (xlsx).** `toXlsx(rows: object[]): Uint8Array`, настоящий .xlsx (zip), числа числами, булевы как логические, даты и текст строками, `null` пустая ячейка, заголовки жирным, лист называется `Результат`. `downloadFile(filename, data: string | Uint8Array, mime)`: принимает и текст, и байты.
2. **`client/src/auth/accounts.js` и тесты.** Учётные записи: `ensureSeeded`, `listAccounts`, `getAccount`, `verifyLogin`, `registerAccount`, `createAccount`, `updateAccount`, `deleteAccount`, `publicProfile`, `changePassword`.
3. **`client/src/constructor/mock/sqlite.js` и тесты.** `runManualMock(dbName, sql)`: ручной SELECT на демо-базах через SQLite.
4. **Интерфейс (делаю сама):** `auth/session.js`, правки `api.js`, вход и регистрация, профиль с редактированием, шапка с навигацией, `AdminPage`, ручной SQL в новом дизайне, кнопка «Скачать Excel».
