# Веха 10 «Пастель» — открытые задачи

Переехали на доску [Kapelka](https://github.com/users/chollak/projects/1) 2026-11-03 (FT-049). Закрытые задачи вехи с
отчётами «Реализовано / Проверка» — [`docs/tasks/archive/ft-087-143-pastel.md`](../tasks/archive/ft-087-143-pastel.md);
веха слита в `main` PR #90 2026-10-26.

| Задача | Суть | Issue |
|---|---|---|
| FT-089 | Спайк: QR и фото фискального чека | [#191](https://github.com/chollak/finance-tracker-backend/issues/191) |
| FT-134 | Распознавание чека, backend | [#192](https://github.com/chollak/finance-tracker-backend/issues/192) |
| FT-135 | Экраны чека и фото в боте | [#193](https://github.com/chollak/finance-tracker-backend/issues/193) |
| FT-136 | Уборка переходного кода | [#194](https://github.com/chollak/finance-tracker-backend/issues/194) |

- Порядок — связи «blocked by» на доске: FT-134 ждёт FT-089, FT-135 — FT-134, FT-136 — FT-134 и FT-135.
- Экран сверяют скриншотом с доской холста из строки `Design` задачи, в светлой и тёмной теме; проверка названий —
  [`design/README.md`](../../design/README.md).
- После каждой задачи приложение работает: старый экран удаляется в той задаче, которая его заменяет.

Прежний файл — `git show 2e3c5b95:docs/pastel/tasks.md`.
