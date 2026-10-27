# Архив задач — ежедневное пользование и переезд на ПК

Задачи с FT-144: надёжность, закрытый доступ, переезд живого экземпляра на ПК.

Закрыто задач: **1**. Это архив: задачи здесь не переоткрываются и не редактируются.
Активная доска — [`TASKS.md`](../../../TASKS.md), решения по плану — [`decisions.md`](../decisions.md).

---

### FT-158: Remove the dead SSH deploy to AWS

Status: done
Priority: low
Owner: Claude Code, QA — под-чат проверки
Type: repo-hygiene
Size: S

Context:
Джоб `deploy` в `.github/workflows/deploy.yml` ходит по SSH на старый AWS-хост (выведен из планов 2026-08-13) и
запускается только вручную. `docker-cleanup.yml` ходит на тот же хост по расписанию; GitHub отключил его за
неактивность, последний прогон — 2026-03-29. Живой экземпляр теперь обновляется командой на ПК (FT-156), этот путь
не вернётся. `quality-gate` в том же файле — единственная проверка на push в `main`, и она остаётся.

Definition of Done:
- [x] Из `deploy.yml` убран джоб `deploy`; `quality-gate` остаётся и берёт Node из `.nvmrc`, а не 20; файл переименован, если имя больше не отражает суть
- [x] `docker-cleanup.yml` удалён
- [ ] Шукур сам удаляет секреты `SSH_HOST`, `SSH_USER`, `SSH_KEY` в настройках репозитория — внешнее действие Шукура, после PR их ничто не читает
- [x] `Dockerfile` и `docker-compose.yml` не трогаются: Docker сейчас не используется, но удалять их — отдельное решение
- [x] Обновлены места, где деплой описан как законсервированный (`CLAUDE.md`, `docs/knowledge-base/08-development/`)

Реализовано 2026-10-27 (`bba33f7`, PR #97):
- `deploy.yml` → `quality-gate.yml`, имя «Quality gate»: деплоя в файле больше нет, а имя совпадает с id джоба, который
  уже знают документы. Id `quality-gate` не менялся. Джоб берёт Node из `.nvmrc`; шаги — как в `verify.yml`
  (`permissions: contents: read`, `timeout-minutes: 20`, кэш npm для обоих lockfile).
- `docker-cleanup.yml` удалён.
- README и `DEPLOYMENT.md` (разделы «GitHub Actions», вводная `DEPLOYMENT.md`) описывают `verify.yml` и
  `quality-gate.yml` и говорят, что деплоя нет. Из `08-development/troubleshooting.md` убран раздел «SSH
  Authentication Failed (GitHub Actions)» и его строка в сводной таблице.
- `CLAUDE.md` не менялся: SSH-деплоя в нём нет, а «Production/AWS is intentionally parked» — решение 2026-08-13.
- `quality-gate` повторяет `verify.yml`, отличается только триггером (push в `main` против `pull_request`). Слить их —
  `push: branches: [main]` в `verify.yml` и удалить `quality-gate.yml`; по DoD файл оставлен.

Проверка 2026-10-27:
- DoD сверен по пунктам. `gh pr diff 97`: `jobs` в `quality-gate.yml` совпадает с `verify.yml` целиком,
  `permissions: contents: read`, `timeout-minutes: 20`; `concurrency` намеренно не перенесён — на `main` проверяется
  каждый коммит.
- Ссылок на удалённые файлы нет (README, `DEPLOYMENT.md`, `package.json`, `scripts/`, `.github`). `main` не защищён —
  смена имени workflow ничего не ломает.
- Синтаксис трёх workflow — js-yaml (`actionlint` и `act` не установлены).
- `npm run verify` в копии проверки: Jest 84/1276, Vitest 122/1199, dependency-cruiser 323 модуля без нарушений, madge
  без циклов. `gh pr checks 97` — `verify` зелёный за 8m1s.
- Первый прогон «Quality gate» на `main` штаб проверит после мержа.
- Мелочи на потом: раздел «Git Pull Fails on Server» в `troubleshooting.md` (решить в FT-156), устаревшее про
  `synchronize` в `DEPLOYMENT.md:72`.
