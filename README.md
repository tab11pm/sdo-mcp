# SDO TUSUR MCP Server

Первая версия кастомного MCP-сервера для работы с SDO ТУСУР.

Сервер позволяет MCP-клиенту, например LM Studio или MCP Inspector, получать доступ к учебной платформе SDO TUSUR через браузерную автоматизацию Playwright.

## Статус версии

Версия: `0.2.0`

Текущая версия является тестовой и предназначена для локального использования.

На данный момент сервер умеет:

- открывать SDO TUSUR;
- проверять, авторизован ли пользователь;
- выполнять вход через профиль ТУСУР;
- сохранять авторизационную сессию;
- получать список курсов;
- получать список материалов внутри курса;
- читать страницу задания или ресурса;
- скачивать файлы только из конкретного модуля курса;
- сохранять текст страницы модуля в `.txt`.

## Важное разделение URL

В SDO TUSUR есть разные типы страниц. Их нельзя обрабатывать одинаково.

### Страница курса

Пример:

```text
https://sdo.tusur.ru/course/view.php?id=21380
```

Это главная страница курса. На ней находятся ссылки на задания, презентации, ресурсы, тесты и другие элементы.

Для неё используется tool:

```text
list_course_modules
```

Страницу курса нельзя передавать в скачивание одного модуля, иначе можно случайно начать обходить весь курс.

### Ресурс / файл

Пример:

```text
https://sdo.tusur.ru/mod/resource/view.php?id=559755
```

Это конкретный ресурс Moodle, например презентация:

```text
Презентация 1.1. на тему Введение в экономику
```

Для него используется tool:

```text
download_module_files
```

### Задание

Пример:

```text
https://sdo.tusur.ru/mod/assign/view.php?id=559759
```

Это конкретное задание Moodle.

Для него также используется tool:

```text
download_module_files
```

При скачивании задания сервер сохраняет текст задания и скачивает только файлы, прикреплённые к этому заданию.

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
		"title": "Экономика и финансы предприятий",
		"url": "https://sdo.tusur.ru/course/view.php?id=21380"
	}
]
```

### list_course_modules

Получает список материалов и заданий на странице конкретного курса.

Аргументы:

```json
{
	"courseUrl": "https://sdo.tusur.ru/course/view.php?id=21380"
}
```

Пример результата:

```json
{
	"courseUrl": "https://sdo.tusur.ru/course/view.php?id=21380",
	"modules": [
		{
			"title": "Презентация 1.1. на тему Введение в экономику Файл",
			"url": "https://sdo.tusur.ru/mod/resource/view.php?id=559755",
			"type": "resource"
		},
		{
			"title": "Задание №1 Кейсы",
			"url": "https://sdo.tusur.ru/mod/assign/view.php?id=559759",
			"type": "assign"
		}
	]
}
```

### get_assignment_details

Открывает страницу задания или ресурса и возвращает текст страницы.

Аргументы:

```json
{
	"assignmentUrl": "https://sdo.tusur.ru/mod/assign/view.php?id=559759"
}
```

Также может использоваться для ресурса:

```json
{
	"assignmentUrl": "https://sdo.tusur.ru/mod/resource/view.php?id=559755"
}
```

### download_module_files

Скачивает файлы только из одного конкретного модуля SDO TUSUR.

Поддерживаемые типы:

```text
/mod/resource/view.php
/mod/assign/view.php
```

Аргументы:

```json
{
	"moduleUrl": "https://sdo.tusur.ru/mod/resource/view.php?id=559755"
}
```

или:

```json
{
	"moduleUrl": "https://sdo.tusur.ru/mod/assign/view.php?id=559759"
}
```

Не поддерживается напрямую:

```text
/course/view.php
```

Для страницы курса сначала нужно вызвать:

```text
list_course_modules
```

а затем передать конкретный `resource` или `assign` URL в:

```text
download_module_files
```

## Скачивание файлов

Скачивание работает по правилу:

```text
course URL    → только получить список модулей
resource URL  → скачать только этот ресурс
assign URL    → скачать только файлы этого задания
```

Сервер специально игнорирует ссылки на соседние страницы:

```text
/course/view.php
/mod/assign/view.php
/mod/resource/view.php
/mod/forum/
/mod/quiz/
/user/
/grade/
/calendar/
```

Это сделано, чтобы случайно не скачать весь курс при обработке одного задания.

Реальными файлами считаются ссылки вида:

```text
/pluginfile.php/
/webservice/pluginfile.php/
```

а также прямые ссылки на файлы:

```text
.pdf
.doc
.docx
.xls
.xlsx
.ppt
.pptx
.zip
.rar
.7z
.txt
.jpg
.jpeg
.png
```

## Куда сохраняются файлы

Файлы сохраняются в папку:

```text
downloads/
```

Для каждого модуля создаётся отдельная папка:

```text
downloads/resource-559755 - Презентация 1.1. на тему Введение в экономику/
```

или:

```text
downloads/assign-559759 - Задание №1 Кейсы/
```

Внутри всегда сохраняется текст страницы:

```text
module-text.txt
```

Если на странице есть прикреплённые файлы, они сохраняются рядом.

Пример результата:

```json
{
	"moduleType": "resource",
	"moduleId": "559755",
	"moduleUrl": "https://sdo.tusur.ru/mod/resource/view.php?id=559755",
	"title": "Презентация 1.1. на тему Введение в экономику",
	"outputDir": "downloads\\resource-559755 - Презентация 1.1. на тему Введение в экономику",
	"textPath": "downloads\\resource-559755 - Презентация 1.1. на тему Введение в экономику\\module-text.txt",
	"foundLinks": 1,
	"files": [
		{
			"title": "presentation.pdf",
			"url": "https://sdo.tusur.ru/pluginfile.php/...",
			"path": "downloads\\resource-559755 - ...\\presentation.pdf",
			"status": "downloaded"
		}
	]
}
```

## Установка

Установить зависимости:

```powershell
npm install
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

Сервер не должен начинать вход с:

```text
https://sdo.tusur.ru/login/index.php
```

Потому что при наличии токена Moodle может показать страницу выхода или подтверждения смены состояния сессии.

Правильная стартовая страница:

```text
https://sdo.tusur.ru/
```

## Важные файлы

```text
src/
  index.ts                    # MCP server и регистрация tools
  browser.ts                  # запуск Playwright и сохранение auth state
  sdo.ts                      # логика входа, курсов, модулей и скачивания
  test-login.ts               # ручной тест логина без MCP-клиента
  test-module-download.ts     # ручной тест скачивания одного модуля

storage/
  auth.json                   # сохранённая сессия Playwright

downloads/
  ...                         # скачанные материалы

dist/
  index.js                    # собранный MCP-сервер
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

## Локальный тест логина без MCP-клиента

```powershell
npx tsx src/test-login.ts
```

Если всё работает, откроется браузер, произойдёт вход в SDO, а в терминале появится список курсов.

## Локальный тест скачивания одного ресурса

Пример для презентации:

```powershell
npx tsx src/test-module-download.ts "https://sdo.tusur.ru/mod/resource/view.php?id=559755"
```

Этот тест должен скачать только конкретный ресурс:

```text
Презентация 1.1. на тему Введение в экономику
```

Он не должен обходить весь курс.

## Локальный тест скачивания одного задания

```powershell
npx tsx src/test-module-download.ts "https://sdo.tusur.ru/mod/assign/view.php?id=559759"
```

Этот тест должен сохранить текст конкретного задания и скачать только файлы, прикреплённые к нему.

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
list_course_modules
get_assignment_details
download_module_files
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

````

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
````

Важно:

- использовать полный путь к `node.exe`;
- использовать прямые слэши `/`;
- указать правильный `cwd`, чтобы `.env` был найден;
- перед подключением выполнить `npm run build`.

## Типичные ошибки

### `spawn node ENOENT`

LM Studio не может найти Node.js.

Решение: указать полный путь к `node.exe`:

```json
"command": "C:/Program Files/nodejs/node.exe"
```

### `dist/index.js` не найден

Проект не был собран.

Решение:

```powershell
npm run build
```

### `test-module-download.ts` не найден

Файл теста ещё не создан.

Решение: создать файл:

```text
src/test-module-download.ts
```

### `Unexpected token Logging`

В коде есть `console.log`.

Решение: заменить `console.log` на `console.error`.

### Код идёт в `profile.tusur.ru`, хотя курсы уже видны

Проблема в проверке авторизации.

Решение: в `isLoggedIntoSdo` сначала проверять наличие ссылок курсов:

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

### Скачивание пытается пройти по 30+ ссылкам

Значит в функцию скачивания был передан URL курса или старая версия функции собирает все ссылки курса.

Правильная логика:

```text
/course/view.php        → list_course_modules
/mod/resource/view.php  → download_module_files
/mod/assign/view.php    → download_module_files
```

Для скачивания нельзя передавать:

```text
https://sdo.tusur.ru/course/view.php?id=21380
```

Сначала нужно получить список модулей, потом скачать конкретный модуль:

```text
https://sdo.tusur.ru/mod/resource/view.php?id=559755
```

или:

```text
https://sdo.tusur.ru/mod/assign/view.php?id=559759
```

## Безопасность

Не публиковать:

```text
.env
storage/auth.json
debug-*.png
downloads/
```

Эти файлы могут содержать:

- логин;
- пароль;
- cookies;
- данные авторизационной сессии;
- содержимое личного кабинета;
- учебные материалы.

## Ограничения версии 0.2.0

Версия 0.2.0 не умеет:

- скачивать весь курс одной командой;
- автоматически выбирать нужное задание по названию;
- отправлять готовые работы;
- работать через удалённый HTTPS MCP;
- реализовывать OAuth;
- обходить CAPTCHA или 2FA;
- гарантированно работать после изменения интерфейса SDO.

## План развития

### v0.3

- добавить `download_course_materials(courseUrl)` с явным подтверждением;
- добавить фильтр по типам модулей: `resource`, `assign`, `quiz`;
- добавить поиск модуля по названию;
- добавить сохранение JSON-индекса курса;
- добавить защиту от повторного скачивания уже скачанных файлов.

### v0.4

- добавить парсинг дедлайнов;
- добавить список активных заданий;
- добавить `prepare_assignment_context`;
- добавить чтение скачанных PDF/DOCX/TXT.

### v0.5

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
