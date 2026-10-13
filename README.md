# SDO TUSUR MCP Server

Локальный MCP-сервер для Online Lecture. Через Playwright он входит в SDO ТУСУР, проверяет сохранённую сессию и находит активность онлайн-лекции BigBlueButton (BBB) в курсе. Сервер работает через stdio.

## Установка и запуск

```sh
npm install
npm run build
node dist/index.js
```

Для MCP-клиента укажите команду `node` с аргументом, содержащим абсолютный путь к `dist/index.js`. Сообщения протокола идут через stdout, диагностические сообщения — через stderr.

## Использование как зависимость

Добавьте в `package.json` приложения зависимость от выпущенного тега:

```json
"sdo_mcp": "github:tab11pm/sdo-mcp#v1.2.0"
```

При установке из git npm собирает TypeScript через `prepare`; точка входа находится в
`node_modules/sdo_mcp/dist/index.js`. Запускайте её как процесс MCP по stdio:

```bash
node node_modules/sdo_mcp/dist/index.js
```

`SDO_BROWSER_CHANNEL=msedge` заставляет Playwright использовать установленный Microsoft
Edge. Если переменная не задана или содержит только пробелы, используется Chromium
Playwright; установите его командой `npx playwright install chromium`. Ошибка запуска
браузера возвращается инструменту с подсказкой по выбранному каналу.

## Инструменты

### `sdo_login`

Выполняет вход через SSO кабинета ТУСУРа и сохраняет сессию Playwright в `SDO_AUTH_STATE_PATH`. Аргументы не нужны. Успешный ответ: `{"status":"logged_in"}`.

### `check_sdo_auth`

Проверяет, действует ли сохранённая сессия. Аргументы не нужны. Ответ: `{"authenticated":true}` или `{"authenticated":false}`.

### `resolve_online_lecture`

Ищет BBB-активность в курсе, используя сохранённую сессию. Передайте ровно один из `courseUrl` и `courseQuery`; необязательный `lectureQuery` уточняет название лекции.

```json
{
	"courseQuery": "физика",
	"lectureQuery": "лекция 1"
}
```

Ответ имеет статус `resolved`, `ambiguous`, `not_found` или `auth_required`. При `resolved` возвращаются курс и модуль со стабильным URL активности BBB. При нескольких совпадениях `ambiguous` содержит кандидатов. Временные ссылки входа в комнату не возвращаются. Этот инструмент сам не выполняет вход: сначала вызовите `sdo_login`, если сессии нет или она истекла.

## Переменные окружения

| Переменная | Назначение |
| --- | --- |
| `SDO_USERNAME` | Логин кабинета ТУСУРа для `sdo_login`. |
| `SDO_PASSWORD` | Пароль кабинета ТУСУРа для `sdo_login`. |
| `SDO_AUTH_STATE_PATH` | Путь к файлу состояния сессии; по умолчанию `storage/auth.json`. Лучше задавать абсолютный путь. |
| `HEADLESS` | При значении `true` запускает браузер без окна; при других значениях открывает окно. |
| `SDO_BROWSER_CHANNEL` | Канал установленного браузера, например `msedge`; без значения используется Chromium Playwright. |
| `SDO_DEBUG_SCREENSHOTS` | Только при значении `1` сохраняет отладочные снимки страниц входа в рабочую папку. Снимки могут содержать данные входа. |

Файл состояния сессии и отладочные снимки содержат чувствительные данные. Храните их локально и не добавляйте в Git.

## Несовместимое изменение

Для поставки с Online Lecture удалены инструменты `list_courses`, `get_assignment_details`, `download_module_files`, `list_course_modules` и `find_course_module`. Клиентам, которые вызывали их, потребуется перейти на три инструмента выше. Сервер больше не предоставляет скачивание материалов курса.

## Разработка

```sh
npx tsc --noEmit
npm test
npm run build
```
