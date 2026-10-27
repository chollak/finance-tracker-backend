# Живой экземпляр на ПК (Windows + WSL)

Daftar для ежедневного пользования живёт на ПК Шукура с Windows + WSL. ПК включён «как получится»: экземпляр сам
поднимается после включения и открывается с iPhone по постоянному адресу в tailnet. Решение — запись 2026-10-26 в
[`docs/tasks/decisions.md`](../../tasks/decisions.md), задача FT-156. Мак остаётся для разработки: `npm run dev:miniapp`
(Cloudflare quick tunnel) и свой dev-бот — [Quick Start](quick-start.md).

## Как устроено

| Где | Что | Зачем |
|---|---|---|
| Windows | Tailscale — служба в режиме Run unattended | ПК в tailnet и без входа в Windows |
| Windows | `tailscale serve` → `https://<пк>.<tailnet>.ts.net` → `http://127.0.0.1:3000` | постоянный HTTPS-адрес для Mini App, виден только устройствам tailnet |
| Windows | задача Планировщика `Daftar WSL` | запускает WSL при старте системы и держит его: без неё WSL гасит дистрибутив, когда закрыт последний терминал |
| Windows | сон от сети выключен | спящий ПК — молчащий бот |
| WSL (Ubuntu, systemd) | сервис `daftar.service` → `node dist/index.js` | сам поднимается и перезапускается, логи в journald |
| `~/daftar-live` | копия репозитория на `main`, своя `data/` и `.env.local` | ветки разработки и их миграции не трогают живую базу |

Бот работает через long polling — только исходящие запросы, адрес tailnet ему не нужен. Пока ПК выключен, Telegram
хранит сообщения до 24 часов и отдаёт их после включения.

Файлы в репозитории: [`ops/live/daftar.service`](../../../ops/live/daftar.service) — шаблон unit-файла,
[`ops/live/env.local.example`](../../../ops/live/env.local.example) — шаблон `.env.local` без значений,
[`scripts/live-update.sh`](../../../scripts/live-update.sh) — обновление одной командой.

### Почему так

- **`tailscale serve` — в Windows, а не в WSL.** Tailscale советует ставить клиент только в Windows и не ставить его
  внутрь WSL 2: два клиента на одной машине ломают трафик — пакеты Tailscale не помещаются в пакеты Tailscale
  ([KB 1295](https://tailscale.com/kb/1295/install-windows-wsl2)). Служба Tailscale в Windows нужна и так: она работает
  без входа пользователя. А порт, который слушает сервер в WSL 2, по умолчанию доступен из Windows на `localhost`
  (режим сети NAT, `localhostForwarding=true` — [Microsoft](https://learn.microsoft.com/en-us/windows/wsl/wsl-config)),
  поэтому `tailscale serve` в Windows видит сервер на `127.0.0.1:3000`. Цель — именно `http://127.0.0.1:3000`: Tailscale
  проксирует только на `127.0.0.1` ([KB 1242](https://tailscale.com/kb/1242/tailscale-serve)), а `localhost` в Windows
  может уйти на IPv6 `::1`.
- **Node — через `scripts/nvm-exec.sh`, а не по абсолютному пути.** Версия одна, из `.nvmrc`: сервис и `npm ci` в
  `live-update.sh` идут на одном и том же Node, и нативный модуль `sqlite3`, собранный под него, подходит. Путь вида
  `~/.nvm/versions/node/v22.x.y/bin/node` пришлось бы править после каждого `nvm install`, а смена версии в `.nvmrc`
  без правки unit-файла сломала бы `sqlite3`. Обёртка заканчивается `exec`, поэтому главный процесс сервиса — сам
  `node`, и SIGTERM при остановке получает он: приложение закрывает базу.
- **Перезапуски — `Restart=always` с растущей паузой.** Первая пауза 10 с, потом длиннее, до 10 минут
  (`RestartSteps=6`, `RestartMaxDelaySec=10min`; нужен systemd 254+, в Ubuntu 24.04 — 255). После FT-154 процесс
  завершается, когда опрос Telegram сломан насовсем: неверный токен или 409 от второго процесса на том же токене. Так
  это несколько попыток в час, а не каждые 10 секунд, и сервис вернётся сам, когда причина уйдёт (например, на маке
  остановили второй экземпляр). Ручной `systemctl restart` и `live-update.sh` начинают паузы с 10 с заново.
  `StartLimitBurst=20` за `StartLimitIntervalSec=1h` при растущей паузе не достигается: за первый час выходит около 11
  стартов, потом 6 в час. Лимит нужен на systemd старше 254 (Ubuntu 22.04 — 249): там `RestartSteps` пропускается с
  предупреждением, и без лимита сервис перезапускался бы каждые 10 с; с лимитом он останавливается после 20 попыток.
- **`After=network.target`, без `network-online.target`.** В WSL служба ожидания сети может задерживать старт на
  минуты, а приложению сеть на старте не нужна: опрос Telegram и курс ЦБ сами повторяют запросы.
- **`NODE_ENV=production` задан в unit-файле:** живой сервис работает в production, что бы ни было в `.env.local`.
  В `.env.local` он тоже есть — для команд, которые запускаются руками (`migration:show` и подобные).
- **`TZ=Asia/Tashkent` — в `.env.local`.** Старый код бюджетов, дашборда и лимитов берёт часы машины. Приложение
  читает `.env.local` уже после запуска, но Node применяет `TZ`, заданный во время работы (проверено на Node 22).

## Что нужно

- Windows 10 или 11 с WSL 2 из Microsoft Store: `wsl --version` отвечает (иначе `wsl --update`); дистрибутив Ubuntu
  (`wsl -l -v`, версия 2).
- Аккаунт Tailscale; Tailscale на iPhone включён всегда.
- Пароль учётной записи Windows — для учётки Microsoft это пароль от неё. Задача Планировщика хранит его, чтобы
  запускаться без входа. PIN не подходит.
- Свои токен бота и ключ OpenAI для живого экземпляра — не из репозитория и не из dev-окружения мака.

**PowerShell** ниже — Windows, **WSL** — терминал Ubuntu. «От администратора» — PowerShell, запущенный «от имени
администратора».

## 1. Windows: сон и быстрый запуск

PowerShell от администратора:

```powershell
powercfg /change standby-timeout-ac 0     # от сети не засыпать
powercfg /change hibernate-timeout-ac 0   # от сети не уходить в гибернацию
```

Проверить: Параметры → Система → Питание → «При питании от сети переводить в спящий режим через» — «Никогда».

Быстрый запуск выключить: Панель управления → Электропитание → «Действия кнопок питания» → снять «Включить быстрый
запуск» (или `powercfg /hibernate off` — выключает гибернацию вместе с ним). С быстрым запуском «Завершение работы» —
это гибернация ядра, и задача «При запуске системы» после включения может не сработать. Так пишут на форумах, в
документации Microsoft подтверждения нет; второй триггер задачи — «При входе» — страхует этот случай.

## 2. Windows: Tailscale и адрес

1. Установить Tailscale для Windows (tailscale.com/download) и войти.
2. Режим без входа пользователя: значок Tailscale в трее → Preferences → **Run unattended** → Yes. По умолчанию
   Tailscale в Windows отключается, когда пользователь выходит
   ([KB 1088](https://tailscale.com/kb/1088/run-unattended); там же команда `tailscale set --unattended=true`).
3. Админка tailnet → **DNS**: включить **MagicDNS**, затем в разделе HTTPS Certificates — **Enable HTTPS**
   ([KB 1153](https://tailscale.com/kb/1153/enabling-https)). Имена машин попадут в публичный журнал сертификатов
   (Certificate Transparency): если имя ПК говорит лишнее, переименуйте машину в админке до шага 4.
4. PowerShell:

   ```powershell
   tailscale serve --bg http://127.0.0.1:3000
   tailscale serve status
   ```

   `serve status` показывает адрес `https://<пк>.<tailnet>.ts.net` — это `WEB_APP_URL`. С `--bg` настройка хранится
   в службе Tailscale и переживает перезагрузку. Сертификат выдаётся при первом обращении, поэтому первый запрос
   может идти несколько секунд. Пока сервер в WSL не запущен, адрес отвечает 502 — так и должно быть. Выключить:
   `tailscale serve reset`.
5. По желанию: админка → **Machines** → ПК → «…» → **Disable key expiry**. Иначе через 180 дней ключ ПК истечёт и адрес
   перестанет открываться до повторного входа в Tailscale; бот продолжит работать — он ходит в Telegram напрямую.
   Tailscale советует отключать срок только для доверенных устройств.

## 3. WSL: systemd

WSL:

```bash
cat /etc/wsl.conf
```

Если в секции `[boot]` нет `systemd=true` (Ubuntu из `wsl --install` обычно уже с ним):

```bash
printf '[boot]\nsystemd=true\n' | sudo tee -a /etc/wsl.conf
```

Если секция `[boot]` в файле уже есть, допишите строку в неё: `sudo nano /etc/wsl.conf`. Потом в PowerShell
`wsl --shutdown`, снова открыть Ubuntu и проверить
([Microsoft](https://learn.microsoft.com/en-us/windows/wsl/systemd)):

```bash
ps -p 1 -o comm=                 # systemd
systemctl --version | head -n 1  # 254 и выше — пауза перезапуска растёт
```

Журнал между перезагрузками: после перезагрузки `journalctl --list-boots` показывает больше одной строки. Если одну —
`sudo mkdir -p /var/log/journal && sudo systemctl restart systemd-journald`.

## 4. WSL: Node и копия `~/daftar-live`

```bash
sudo apt-get update && sudo apt-get install -y git curl build-essential python3 sqlite3
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.8/install.sh | bash
exec bash                        # перечитать профиль, чтобы появился nvm
git clone https://github.com/chollak/finance-tracker-backend.git ~/daftar-live
cd ~/daftar-live
nvm install                      # версия из .nvmrc
scripts/nvm-exec.sh npm ci --include=dev
```

- Копия клонируется по HTTPS: репозиторий публичный, ключи не нужны, а пушить из живой копии нечего.
- Копия лежит в файловой системе WSL (`~`), не на `/mnt/c`: SQLite на диске Windows медленный и ненадёжный.
- `build-essential` и `python3` нужны, если `sqlite3` не найдёт готовую сборку под этот Node и станет собирать себя;
  `sqlite3` — консоль для ручной проверки базы и для бэкапа FT-157.
- В этой папке не разрабатывают: только `main` и `scripts/live-update.sh`. Ветки — на маке или в другой папке.

## 5. `.env.local`

```bash
cd ~/daftar-live
cp ops/live/env.local.example .env.local
chmod 600 .env.local
nano .env.local
```

Заполнить: `ALLOWED_TELEGRAM_IDS` (свой Telegram id), `TG_BOT_API_KEY`, `TG_BOT_USERNAME`, `OPENAI_API_KEY`,
`WEB_APP_URL` (адрес из шага 2) и `MINIAPP_CHAT_ID` (свой id). `NODE_ENV=production` и `TZ=Asia/Tashkent` уже стоят.
`SHORTCUT_CAPTURE_TOKEN` и `SHORTCUT_CAPTURE_OWNER` для iPhone — раскомментировать после того, как FT-155 будет в
`main`. Значения нигде не печатать и в репозиторий не класть.

> **Один токен — один опрашивающий процесс.** Пока живой экземпляр работает на маке (до переезда FT-159), он
> опрашивает тот же токен: процесс на ПК получит 409, и они будут сбивать друг друга. Поэтому бот на ПК включается
> при переезде, после остановки мака. До него можно проверить всё остальное с `ENABLE_TELEGRAM_POLLING=false` или
> отрепетировать с отдельным ботом от @BotFather. Шаг 7 с боевым токеном уводит кнопку меню живого бота на ПК —
> тоже только при переезде.

## 6. Сборка и сервис systemd

```bash
cd ~/daftar-live
scripts/nvm-exec.sh npm run build:webapp
scripts/nvm-exec.sh npm run build
sed -e "s|__USER__|$USER|g" -e "s|__APP_DIR__|$HOME/daftar-live|g" ops/live/daftar.service \
  | sudo tee /etc/systemd/system/daftar.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now daftar.service
systemctl status daftar.service --no-pager
journalctl -u daftar.service -f  # Ctrl+C — выйти
```

Готово, когда в журнале есть `Server started`, а проверка отвечает `"environment":"production"` и
`"telegramBot":{"state":"running"`:

```bash
curl -s http://127.0.0.1:3000/api/health
```

Первый запуск создаёт пустую базу `data/database.sqlite`; записи с мака переезжают в FT-159. Если шаблон
`ops/live/daftar.service` в репозитории изменился, unit ставится той же командой `sed … | sudo tee …`, затем
`sudo systemctl daemon-reload && sudo systemctl restart daftar.service`.

## 7. Кнопка меню

Один раз — адрес постоянный:

```bash
cd ~/daftar-live
scripts/nvm-exec.sh npm run miniapp:menu -- set --url=https://<пк>.<tailnet>.ts.net --chat-id=<ваш id>
sudo systemctl restart daftar.service
scripts/nvm-exec.sh npm run miniapp:menu -- status --chat-id=<ваш id>
```

`set` пишет `WEB_APP_URL` в `.env.local` этой копии — файл, который читает приложение, — и ставит кнопку с текстом из
`MINIAPP_MENU_TEXT`. Сервер читает `WEB_APP_URL` при старте, поэтому после `set` — перезапуск. Старые кнопки в чате
ведут на прежний адрес quick tunnel: `/start` пришлёт новые.

## 8. Windows: WSL при старте системы

PowerShell от администратора; имя дистрибутива — из `wsl -l -v`:

```powershell
$distro = 'Ubuntu'
$user = "$env:USERDOMAIN\$env:USERNAME"
$action = New-ScheduledTaskAction -Execute "$env:WINDIR\System32\wsl.exe" -Argument "-d $distro --exec /bin/sleep infinity"
$triggers = @((New-ScheduledTaskTrigger -AtStartup), (New-ScheduledTaskTrigger -AtLogOn -User $user))
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew `
  -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$cred = Get-Credential -UserName $user -Message 'Пароль Windows: задача запускает WSL без входа'
Register-ScheduledTask -TaskName 'Daftar WSL' -Action $action -Trigger $triggers -Settings $settings `
  -User $user -Password $cred.GetNetworkCredential().Password -RunLevel Limited
Start-ScheduledTask -TaskName 'Daftar WSL'
Get-ScheduledTask -TaskName 'Daftar WSL' | Select-Object TaskName, State
```

- `State` должен быть `Running`. `Ready` значит, что `wsl.exe` завершился и WSL снова может погаснуть.
- Задача запускает в дистрибутиве `sleep infinity` и висит, пока он работает: пока жив этот `wsl.exe`, WSL не гасит
  дистрибутив, а systemd держит `daftar.service`. Сами службы systemd WSL не держат
  ([Microsoft](https://learn.microsoft.com/en-us/windows/wsl/systemd)).
- Задача идёт от вашей учётки: дистрибутивы WSL у каждого пользователя свои. С паролем она запускается независимо от
  того, вошёл ли пользователь, и без окна.
- `ExecutionTimeLimit` 0 — без ограничения: по умолчанию Планировщик останавливает задачу через 72 часа
  ([Microsoft](https://learn.microsoft.com/en-us/windows/win32/taskschd/tasksettings-executiontimelimit)).
- Триггер «При входе» — запасной, на случай быстрого запуска; второй экземпляр не стартует (`IgnoreNew`).
- После `wsl --shutdown` задача завершается — запустить снова: `Start-ScheduledTask -TaskName 'Daftar WSL'`.
- Сменили пароль Windows — обновить его в задаче:
  `$cred = Get-Credential -UserName $user; Set-ScheduledTask -TaskName 'Daftar WSL' -User $user -Password $cred.GetNetworkCredential().Password`.

## 9. Проверка

1. PowerShell: `curl.exe -s http://127.0.0.1:3000/api/health` — тот же ответ, что в WSL. Так проверяется доступ
   Windows к серверу в WSL, на котором стоит `tailscale serve`.
2. iPhone с включённым Tailscale: `https://<пк>.<tailnet>.ts.net/api/health` в Safari, потом Mini App по кнопке меню.
3. **Перезагрузка.** Перезагрузить Windows и не входить (или войти, но не открывать Ubuntu). Через пару минут с
   iPhone: бот отвечает на сообщение, Mini App открывается по кнопке меню. Потом в PowerShell:
   `Get-ScheduledTask -TaskName 'Daftar WSL'` — `Running`, `wsl -l -v` — `Running`; в WSL
   `systemctl status daftar.service` — `active (running)` с момента загрузки.

Если в пункте 1 Windows не получает ответа, а `curl` внутри WSL получает, значит, проброс `localhost` из WSL не
работает. Тогда — зеркальный режим сети (Windows 11 22H2+): в `%UserProfile%\.wslconfig`

```ini
[wsl2]
networkingMode=mirrored
```

затем `wsl --shutdown` и `Start-ScheduledTask -TaskName 'Daftar WSL'`. В этом режиме `127.0.0.1` у Windows и WSL общий
([Microsoft](https://learn.microsoft.com/en-us/windows/wsl/networking)); входящие из сети в WSL закрыты брандмауэром
Hyper-V, пока их не разрешить, — и разрешать не нужно.

## Обновление

```bash
cd ~/daftar-live
scripts/live-update.sh
```

Скрипт:

1. Отказывается работать не на `main`, с изменёнными или лишними файлами в дереве и без `.env.local`.
2. `git pull --ff-only origin main` — и показывает новые коммиты.
3. `npm ci --include=dev`, `npm run build:webapp`, `npm run build` — на Node из `.nvmrc`. `--include=dev` нужен, чтобы
   TypeScript и Vite ставились, даже если в оболочке выставлен `NODE_ENV=production`.
4. `sudo systemctl reset-failed` и `restart daftar.service` (спросит пароль sudo). `reset-failed` — на случай, если
   сервис остановлен лимитом стартов.
5. Ждёт до 60 с, пока `/api/health` ответит 200, и печатает окружение и состояние бота.
6. Печатает прошлый коммит — он нужен для отката.

Миграции применяет само приложение на старте: сначала копирует `data/database.sqlite` в
`data/backups/database-<дата>-<время>.sqlite`, в журнале — `Database migrations applied` с `backupPath`. Пока идёт
сборка (пара минут), работает старая версия; бот молчит только на время перезапуска, а пришедшие сообщения Telegram
отдаст после старта. Без новых коммитов скрипт всё равно пересобирает и перезапускает — так повторный запуск чинит
прерванное обновление. Автообновления нет намеренно (решение 2026-10-26): миграции применяются под присмотром.

Если сборка упала, сервис продолжает старую версию из памяти, но следующий его старт (сбой, перезагрузка) возьмёт
сломанную сборку. Сразу исправить и повторить или откатиться.

## Откат

Нужен прошлый коммит — его печатает `live-update.sh` (или `git reflog`).

```bash
cd ~/daftar-live
sudo systemctl stop daftar.service
git switch --detach <прошлый коммит>
scripts/nvm-exec.sh npm ci --include=dev
scripts/nvm-exec.sh npm run build:webapp
scripts/nvm-exec.sh npm run build
sudo systemctl start daftar.service
```

Если обновление применило миграции, старому коду нужна старая схема. Два пути, оба — при остановленном сервисе:

- **Сохранить записи, сделанные после обновления:** до `git switch`, ещё на новой версии,
  `scripts/nvm-exec.sh npm run migration:revert` — отменяет последнюю миграцию (перед этим сам копирует базу в
  `data/backups/`). Миграций было несколько — повторить столько раз, сколько их в `applied` в журнале.
- **Вернуть базу как была до обновления** (записи после него пропадут): после `git switch`

  ```bash
  ls -t data/backups/ | head -n 3
  cp data/database.sqlite "data/backups/database-before-rollback-$(date +%Y%m%d-%H%M%S).sqlite"
  cp data/backups/database-<дата>-<время>.sqlite data/database.sqlite
  ```

Пока копия на откате, `live-update.sh` отказывается работать (не `main`) — новая версия не вернётся случайно. Когда
исправление в `main`: `git switch main && scripts/live-update.sh`.

## Логи и состояние

```bash
systemctl status daftar.service --no-pager
journalctl -u daftar.service -f                      # следить
journalctl -u daftar.service -b --no-pager           # с последней загрузки
journalctl -u daftar.service --since "1 hour ago" --no-pager
journalctl -u daftar.service --grep '"level":"error"' --no-pager
systemctl show daftar.service -p NRestarts           # сколько раз systemd его перезапускал
```

В production приложение пишет JSON — по строке на событие. Сервис `failed` после лимита стартов:
`sudo systemctl reset-failed daftar.service && sudo systemctl start daftar.service` — сначала причину в журнале.

## Бэкап (FT-157)

Ночную копию базы в папку Google Drive делает FT-157 — она допишет сюда таймер, проверку и восстановление.

- **Живую базу в облачную папку не класть.** Ни `data/`, ни `~/daftar-live` целиком не должны лежать в папке, которую
  синхронизирует Google Drive (или OneDrive, Dropbox): клиент синхронизации копирует файл посреди записи и может
  подменить его своей версией, а SQLite от этого портится. В облако идут только готовые копии, снятые
  `sqlite3 … ".backup …"`.
- Пока FT-157 нет, копии базы есть только перед миграциями, в `data/backups/` — на том же диске, что и сама база, а
  весь WSL — один файл `ext4.vhdx`.

## Если что-то не так

| Признак | Где смотреть |
|---|---|
| Бот молчит | `systemctl status daftar.service`, `journalctl -u daftar.service -n 50`; не опрашивает ли тот же токен мак (409) |
| Бот отвечает, Mini App не открывается | Windows: `tailscale serve status`, `curl.exe -s http://127.0.0.1:3000/api/health`; на iPhone включён Tailscale |
| После перезагрузки не работает ничего | `Get-ScheduledTask -TaskName 'Daftar WSL'`, `wsl -l -v`, затем `systemctl status daftar.service` |
| `live-update.sh` отказывается или `git pull` падает | [Troubleshooting → Live Instance on the PC](troubleshooting.md#live-instance-on-the-pc) |
