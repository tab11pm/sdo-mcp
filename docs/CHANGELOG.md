# Changelog

## 0.1.0

Первая тестовая версия SDO TUSUR MCP.

### Добавлено

- MCP server через stdio.
- Tool `list_courses`.
- Tool `get_assignment_details`.
- Playwright-авторизация через `profile.tusur.ru`.
- Сохранение сессии в `storage/auth.json`.
- Локальный тест `test-login.ts`.
- Поддержка запуска через MCP Inspector.
- Базовая совместимость с LM Studio.

### Известные ограничения

- Нет скачивания файлов.
- Нет парсинга списка заданий.
- Нет remote HTTP transport.
- Нет OAuth.
- Нет автоматической отправки работ.
