# Changelog

## 0.2.0

### Добавлено

- Tool `list_course_modules`.
- Tool `download_module_files`.
- Разделение URL на `course`, `resource`, `assign`.
- Скачивание только из одного конкретного модуля.
- Сохранение текста страницы модуля в `module-text.txt`.
- Защита от случайного обхода всего курса.
- Тест `test-module-download.ts`.

### Изменено

- Старая логика `download_assignment_files` заменяется на универсальную `download_module_files`.
- `/course/view.php` больше не должен использоваться для прямого скачивания.
- `/mod/resource/view.php` и `/mod/assign/view.php` теперь обрабатываются как отдельные модули.

### Исправлено

- Ошибка, при которой код собирал все ссылки курса и пытался скачать 30+ материалов.
- Ошибка зависания на ожидании `download` event для страниц, которые не являются файлами.

## 0.1.0

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

- Нет безопасного скачивания одного модуля.
- Нет парсинга списка модулей курса.
- Нет remote HTTP transport.
- Нет OAuth.
- Нет автоматической отправки работ.
