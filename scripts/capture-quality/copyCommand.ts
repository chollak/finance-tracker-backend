/**
 * How the copy for the capture quality report (FT-217) is taken on the PC — the command of `live-instance.md`, «Отчёт
 * о качестве записи (FT-217)», kept here so the report's hints never show an older one:
 * - `rm -f` first: a failed `.backup` must not leave last time's copy to be counted silently;
 * - `test -s`: `sqlite3` given a mistyped path would create an empty database instead of failing;
 * - `-bail`: stop on the first error, «database is locked» included.
 */
export const SAFE_COPY_COMMAND =
  'rm -f /tmp/kapelka-report.sqlite && test -s data/database.sqlite && ' +
  'sqlite3 -bail -init /dev/null data/database.sqlite ".timeout 30000" ".backup /tmp/kapelka-report.sqlite"';

/**
 * A failed `.backup` («database is locked» after `-bail`) leaves a file of 0 bytes, and an empty SQLite file has no
 * tables: either is not an old schema, and «update the copy» would send the reader the wrong way.
 */
export const EMPTY_COPY_MESSAGE = `Копия пустая — .backup не удался, повтори копирование: ${SAFE_COPY_COMMAND}`;
