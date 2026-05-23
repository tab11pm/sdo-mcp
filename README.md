# SDO TUSUR MCP Server

Первая версия кастомного MCP-сервера для работы с SDO ТУСУР.

Сервер позволяет MCP-клиенту, например LM Studio или MCP Inspector, получать доступ к учебной платформе SDO TUSUR через браузерную автоматизацию Playwright.

## Статус версии

Версия: `0.1.0`

Текущая версия является тестовой и предназначена для локального использования.

На данный момент сервер умеет:

- открывать SDO TUSUR;
- проверять, авторизован ли пользователь;
- выполнять вход через профиль ТУСУР;
- сохранять авторизационную сессию;
- получать список курсов;
- открывать страницу задания и возвращать её текст.

## Используемый стек

- Node.js
- TypeScript
- MCP TypeScript SDK
- Playwright
- dotenv
- zod

## Архитектура

```text
MCP Client
  |
  | stdio
  v
custom-sdo-mcp
  |
  | Playwright
  v
profile.tusur.ru / sdo.tusur.ru
```

Сервер работает через `stdio`, поэтому его можно подключать к локальным MCP-клиентам.

Для ChatGPT напрямую этот вариант не подходит, потому что ChatGPT требует удалённый HTTPS MCP-сервер и отдельную настройку авторизации.

## Поддерживаемые MCP tools

### list_courses

Получает список курсов из SDO.

Пример результата:

```json
[
	{
		"title": "Название курса",
		"url": "https://sdo.tusur.ru/course/view.php?id=..."
	}
]
```

### get_assignment_details

Открывает страницу задания в SDO и возвращает текст страницы.

Аргументы:

```json
{
	"assignmentUrl": "https://sdo.tusur.ru/mod/assign/view.php?id=..."
}
```

## Установка

Создать проект:

```powershell
mkdir sdo_mcp
cd sdo_mcp
npm init -y
```

Установить зависимости:

```powershell
npm install @modelcontextprotocol/sdk playwright zod dotenv
npm install -D typescript tsx @types/node
npx playwright install chromium
```

Создать TypeScript-конфиг:

```powershell
npx tsc --init
```

## package.json

В `package.json` должны быть указаны:

```json
{
	"type": "module",
	"scripts": {
		"dev": "tsx src/index.ts",
		"build": "tsc",
		"start": "node dist/index.js"
	}
}
```

## Настройка .env

В корне проекта создать файл `.env`:

```env
SDO_URL=https://sdo.tusur.ru
TUSUR_PROFILE_LOGIN_URL=https://profile.tusur.ru/en/users/sign_in
SDO_USERNAME=your_login_or_email
SDO_PASSWORD=your_password
HEADLESS=false
```

Где:

- `SDO_URL` — адрес SDO TUSUR;
- `TUSUR_PROFILE_LOGIN_URL` — адрес страницы входа через профиль ТУСУР;
- `SDO_USERNAME` — логин или email;
- `SDO_PASSWORD` — пароль;
- `HEADLESS=false` — браузер будет открываться визуально.

Для первого тестирования рекомендуется оставить:

```env
HEADLESS=false
```

Так можно видеть, где именно останавливается вход.

## Авторизация

Вход работает по следующей схеме:

1. Сервер открывает `https://sdo.tusur.ru/`.
2. Проверяет, видны ли курсы.
3. Если курсы уже видны, сервер считает пользователя авторизованным.
4. Если авторизации нет, сервер открывает `https://profile.tusur.ru/en/users/sign_in`.
5. Заполняет логин и пароль.
6. После успешного входа пользователь перенаправляется в SDO.
7. Сервер сохраняет состояние авторизации в `storage/auth.json`.

Файл `storage/auth.json` содержит cookies и данные сессии. Его нельзя публиковать или добавлять в Git.

## Важные файлы

```text
src/
  index.ts       # MCP server и регистрация tools
  browser.ts    # запуск Playwright и сохранение auth state
  sdo.ts        # логика входа и работы с SDO
  test-login.ts # ручной тест без MCP-клиента

storage/
  auth.json     # сохранённая сессия Playwright

dist/
  index.js      # собранный MCP-сервер
```

## .gitignore

Рекомендуемый `.gitignore`:

```gitignore
node_modules/
dist/
.env
storage/
downloads/
debug-*.png
```

## Сборка

```powershell
npm run build
```

После сборки должен появиться файл:

```text
dist/index.js
```

Проверить:

```powershell
Test-Path "dist/index.js"
```

Ожидаемый результат:

```text
True
```

## Локальный тест без MCP-клиента

Создать файл:

```text
src/test-login.ts
```

Пример содержимого:

```ts
import 'dotenv/config'
import { getSdoPage } from './browser.js'
import { ensureLoggedIn, listCourses } from './sdo.js'

const { context, page } = await getSdoPage()

try {
	await ensureLoggedIn(page, context)

	const courses = await listCourses(page)

	console.log('COURSES:')
	console.log(JSON.stringify(courses, null, 2))
} catch (error) {
	await page.screenshot({
		path: 'debug-login.png',
		fullPage: true,
	})

	console.error('TEST FAILED:')
	console.error(error)
	console.error('Screenshot saved to debug-login.png')
} finally {
	await context.close()
}
```

Запуск:

```powershell
npx tsx src/test-login.ts
```

Если всё работает, откроется браузер, произойдёт вход в SDO, а в терминале появится список курсов.

## Тест через MCP Inspector

Сначала собрать проект:

```powershell
npm run build
```

Запустить MCP Inspector:

```powershell
npx @modelcontextprotocol/inspector node dist/index.js
```

После запуска Inspector откроет браузер.

В интерфейсе должны быть доступны tools:

```text
list_courses
get_assignment_details
```

Можно выбрать `list_courses` и нажать `Run Tool`.

## Важное правило для stdio MCP

В MCP через `stdio` нельзя писать обычные логи в `stdout`.

Нельзя использовать:

```ts
console.log('text')
```

Потому что `stdout` используется MCP-протоколом для JSON-RPC сообщений.

Для логов нужно использовать:

```ts
console.error('text')
```

Правило:

```text
stdout = только MCP JSON-RPC
stderr = debug-логи
```

Если нарушить это правило, появится ошибка вида:

```text
Unexpected token 'L', "Logging in"... is not valid JSON
```

## Подключение к LM Studio на Windows

Пример конфига MCP для LM Studio:

```json
{
	"mcpServers": {
		"sdo-tsu": {
			"command": "C:/Program Files/nodejs/node.exe",
			"args": ["C:/Users/New/Documents/tusur/sdo_mcp/dist/index.js"],
			"cwd": "C:/Users/New/Documents/tusur/sdo_mcp"
		}
	}
}
```

Важно:

- использовать полный путь к `node.exe`;
- использовать прямые слэши `/`;
- указать правильный `cwd`, чтобы `.env` был найден;
- перед подключением выполнить `npm run build`.

## Проверка путей на Windows

```powershell
Test-Path "C:\Program Files\nodejs\node.exe"
Test-Path "C:\Users\New\Documents\tusur\sdo_mcp\dist\index.js"
Test-Path "C:\Users\New\Documents\tusur\sdo_mcp\.env"
```

Все команды должны вернуть:

```text
True
```

## Типичные ошибки

### spawn node ENOENT

LM Studio не может найти Node.js.

Решение: указать полный путь к `node.exe`:

```json
"command": "C:/Program Files/nodejs/node.exe"
```

### dist/index.js не найден

Проект не был собран.

Решение:

```powershell
npm run build
```

### Unexpected token Logging

В коде есть `console.log`.

Решение: заменить `console.log` на `console.error`.

### Код идёт в profile.tusur.ru, хотя курсы уже видны

Проблема в проверке авторизации.

Решение: в `isLoggedIntoSdo` нужно сначала проверять наличие ссылок курсов:

```ts
page.locator('a[href*="/course/view.php"]')
```

Если ссылки курсов есть, значит пользователь уже авторизован.

### SDO показывает страницу выхода

Не нужно открывать:

```text
https://sdo.tusur.ru/login/index.php
```

Вместо этого нужно открывать:

```text
https://sdo.tusur.ru/
```

Если SDO показывает страницу выхода, нельзя нажимать подтверждение выхода. Нужно вернуться на главную страницу SDO.

## Безопасность

Не публиковать:

```text
.env
storage/auth.json
debug-*.png
```

Эти файлы могут содержать:

- логин;
- пароль;
- cookies;
- данные авторизационной сессии;
- содержимое личного кабинета.

## Ограничения первой версии

Первая версия не умеет:

- скачивать файлы заданий;
- автоматически определять все задания по курсу;
- отправлять готовые работы;
- работать через удалённый HTTPS MCP;
- реализовывать OAuth;
- обходить CAPTCHA или 2FA;
- гарантированно работать после изменения интерфейса SDO.

## План развития

### v0.2

- добавить `list_assignments(courseUrl)`;
- добавить скачивание файлов задания;
- добавить сохранение HTML/текста задания;
- добавить нормальный debug mode.

### v0.3

- добавить `download_assignment_files`;
- добавить `prepare_assignment_context`;
- добавить парсинг дедлайнов;
- добавить фильтрацию активных заданий.

### v0.4

- добавить remote HTTP MCP;
- добавить HTTPS;
- добавить авторизацию MCP-клиента;
- подготовить вариант для ChatGPT Custom MCP.

## Этическое использование

Этот MCP предназначен для помощи в организации учебных материалов:

- читать задания;
- скачивать материалы;
- готовить конспекты;
- помогать разбирать требования;
- формировать черновики;
- напоминать о дедлайнах.

Не рекомендуется использовать MCP для полной автоматической сдачи работ без проверки пользователем.
