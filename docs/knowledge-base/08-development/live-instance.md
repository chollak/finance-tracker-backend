# Живой экземпляр на ПК (Windows + WSL)

Kapelka для ежедневного пользования живёт на ПК Шукура с Windows + WSL. ПК включён «как получится»: экземпляр сам
поднимается после включения и открывается с iPhone по постоянному адресу в tailnet. Решение — запись 2026-10-26 в
[`docs/tasks/decisions.md`](../../tasks/decisions.md), задача FT-156. Мак остаётся для разработки: `npm run dev:miniapp`
(Cloudflare quick tunnel) и @FinanceTrackerDevBot как бот для разработки — [Quick Start](quick-start.md).

## Как устроено

| Где | Что | Зачем |
|---|---|---|
| Windows | Tailscale — служба в режиме Run unattended | ПК в tailnet и без входа в Windows |
| Windows | `tailscale serve` → `https://<пк>.<tailnet>.ts.net` → `http://127.0.0.1:3000` | постоянный HTTPS-адрес для Mini App, виден только устройствам tailnet |
| Windows | задача Планировщика `Kapelka WSL` | запускает WSL при старте системы и держит его: без неё WSL гасит дистрибутив, когда закрыт последний терминал |
| Windows | сон от сети выключен | спящий ПК — молчащий бот |
| WSL (Ubuntu, systemd) | сервис `kapelka.service` → `node dist/index.js` | сам поднимается и перезапускается, логи в journald |
| `~/dev/projects/kapelka-live` | копия репозитория на `main`, своя `data/` и `.env.local` | ветки разработки и их миграции не трогают живую базу |
| WSL → Windows | таймер `kapelka-backup.timer` → копия базы в `C:\KapelkaBackup`, Google Drive выгружает её в облако | база переживёт потерю `ext4.vhdx` — [«Бэкап»](#бэкап-ft-157) |

Бот работает через long polling — только исходящие запросы, адрес tailnet ему не нужен. Пока ПК выключен, Telegram
хранит сообщения до 24 часов и отдаёт их после включения. Записи из них датируются временем отправки, а не включения
(FT-182).

Файлы в репозитории: [`ops/live/kapelka.service`](../../../ops/live/kapelka.service) — шаблон unit-файла,
[`ops/live/env.local.example`](../../../ops/live/env.local.example) — шаблон `.env.local` без значений,
[`scripts/live-update.sh`](../../../scripts/live-update.sh) — обновление одной командой,
[`scripts/backup-db.sh`](../../../scripts/backup-db.sh) и `ops/live/kapelka-backup.*` — ночной бэкап.

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
  (`RestartSteps=6`, `RestartMaxDelaySec=10min`; нужен systemd 254+, в Ubuntu 24.04 — 255): 10, 20, 39, 78 с и так
  далее. В production процесс завершается, когда опрос Telegram сломан насовсем (FT-154): неверный токен, 409 от
  второго процесса на том же токене после всех повторов, нет сети на старте. Так это несколько попыток в час, а не
  каждые 10 секунд, и сервис вернётся сам, когда причина уйдёт. `StartLimitBurst=20` за `StartLimitIntervalSec=1h` при
  растущей паузе не достигается: за первый час выходит около 11 стартов, потом 6 в час.
  - Счётчик перезапусков systemd сбрасывает только ручной старт или `reset-failed`, а не долгая работа без сбоев: после
    ~7 автоматических перезапусков за жизнь сервиса каждый новый сбой ждёт 10 минут. `systemctl restart` и
    `live-update.sh` начинают паузы с 10 с заново (`systemctl show kapelka.service -p NRestarts` — счётчик).
  - На systemd старше 254 (Ubuntu 22.04 — 249) `RestartSteps` пропускается с предупреждением, и пауза всегда 10 с;
    лимит останавливает сервис после 20 быстрых попыток. Тогда долгая потеря сети на старте оставляет сервис в
    `failed` до ручного `sudo systemctl reset-failed kapelka.service && sudo systemctl start kapelka.service`. Поэтому
    лучше Ubuntu 24.04.
- **`After=network.target`, без `network-online.target`.** В WSL служба ожидания сети может задерживать старт на
  минуты, а приложению сеть на старте не нужна: опрос Telegram и курс ЦБ сами повторяют запросы.
- **`NODE_ENV=production` задан в unit-файле:** живой сервис работает в production, что бы ни было в `.env.local`.
  В `.env.local` он тоже есть — для команд, которые запускаются руками (`migration:show` и подобные).
- **`TZ=Asia/Tashkent` — в `.env.local`.** Старый код бюджетов, дашборда и лимитов берёт часы машины. Приложение
  читает `.env.local` уже после запуска, но Node применяет `TZ`, заданный во время работы (проверено на Node 22).

## Что нужно

- Windows 11 (или 10) с WSL 2 из Microsoft Store версии 0.67.6 или новее — с ней WSL умеет systemd: `wsl --version`
  отвечает (иначе `wsl --update`). Дистрибутив Ubuntu, версия 2 (`wsl -l -v`); если его нет — PowerShell:
  `wsl --install -d Ubuntu` (сейчас это 24.04), при первом запуске он попросит имя и пароль Linux. Забыли пароль
  Linux — `wsl -d Ubuntu -u root passwd <имя>`.
- Аккаунт Tailscale; Tailscale на iPhone включён всегда.
- Пароль учётной записи Windows — для учётки Microsoft это пароль от неё. Задача Планировщика хранит его, чтобы
  запускаться без входа. PIN не подходит.
- **Бот.** У ПК свой бот — новый «Kapelka», его Шукур заводит в BotFather (`@kapelkabot` или свободный вариант;
  решение 2026-10-28, шаг 1 раздела [«Переезд»](#переезд-включить-бота-ft-159)). Нынешний @FinanceTrackerDevBot
  остаётся маку как бот для разработки — его токен на ПК не кладут. Записи привязаны к Telegram id пользователя, а не
  к боту, поэтому переезжают вместе с базой; старая переписка остаётся в чате со старым ботом.
- Ключ OpenAI — свой для живого экземпляра, не из репозитория.

**PowerShell** ниже — Windows, **WSL** — терминал Ubuntu. «От администратора» — PowerShell, запущенный «от имени
администратора».

## 1. Windows: сон и быстрый запуск

PowerShell от администратора:

```powershell
powercfg /change standby-timeout-ac 0     # от сети не засыпать
powercfg /change hibernate-timeout-ac 0   # от сети не уходить в гибернацию
```

`/change` меняет только активную схему электропитания: если потом выбрать другую схему, команды нужно повторить.
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
   `tailscale serve reset`. Если `serve` отвечает отказом в доступе — те же команды в PowerShell от администратора.
5. По желанию: админка → **Machines** → ПК → «…» → **Disable key expiry**. Иначе через 180 дней ключ ПК истечёт и адрес
   перестанет открываться до повторного входа в Tailscale; бот продолжит работать — он ходит в Telegram напрямую.
   Tailscale советует отключать срок только для доверенных устройств.

## 3. WSL: systemd

WSL:

```bash
cat /etc/wsl.conf
```

Ubuntu из `wsl --install` обычно уже с `systemd=true` в секции `[boot]`. Если строки нет, а секции `[boot]` нет тоже:

```bash
printf '\n[boot]\nsystemd=true\n' | sudo tee -a /etc/wsl.conf
```

Если секция `[boot]` есть, а строки нет — дописать `systemd=true` в неё: `sudo nano /etc/wsl.conf`. Потом в PowerShell
`wsl --shutdown`, снова открыть Ubuntu и проверить
([Microsoft](https://learn.microsoft.com/en-us/windows/wsl/systemd)):

```bash
ps -p 1 -o comm=                 # systemd
systemctl --version | head -n 1  # 254 и выше — пауза перезапуска растёт
```

Журнал между перезагрузками: после перезагрузки `journalctl --list-boots` показывает больше одной строки. Если одну —
`sudo mkdir -p /var/log/journal && sudo systemctl restart systemd-journald`.

## 4. WSL: Node и копия `~/dev/projects/kapelka-live`

```bash
sudo apt-get update && sudo apt-get install -y git curl build-essential python3 sqlite3
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.8/install.sh | bash
exec bash                        # перечитать профиль, чтобы появился nvm
git clone https://github.com/chollak/finance-tracker-backend.git ~/dev/projects/kapelka-live
cd ~/dev/projects/kapelka-live
nvm install                      # версия из .nvmrc
scripts/nvm-exec.sh npm ci --include=dev
```

- Копия клонируется по HTTPS: репозиторий публичный, ключи не нужны, а пушить из живой копии нечего.
- Копия лежит в файловой системе WSL (`~`), не на `/mnt/c`: SQLite на диске Windows медленный и ненадёжный.
- `build-essential` и `python3` нужны, если `sqlite3` станет собирать себя из исходников; `sqlite3` из apt — консоль
  для ручной проверки базы и для бэкапа FT-157.
- **`sqlite3` 6 (FT-048): готовая сборка — на Ubuntu 24.04 и новее; на 22.04 — сборка из исходников.** Готовая
  сборка для Linux x64 скачивается с GitHub и требует glibc 2.38+ (`ldd --version`; в 24.04 — 2.39). На Ubuntu 22.04
  (2.35) `npm ci` проходит без ошибок, но модуль не грузится. Там один раз до `npm ci`:
  `echo build_from_source=sqlite3 >> ~/.npmrc`. Сборка добавляет к `npm ci` минуту-полторы.
- В этой папке не разрабатывают: только `main` и `scripts/live-update.sh`. Ветки — на маке или в другой папке.

## 5. `.env.local`

```bash
cd ~/dev/projects/kapelka-live
cp ops/live/env.local.example .env.local
chmod 600 .env.local
nano .env.local
```

Заполнить: `ALLOWED_TELEGRAM_IDS` (свой Telegram id), `OPENAI_API_KEY`, `WEB_APP_URL` (адрес из шага 2) и
`MINIAPP_CHAT_ID` (свой id); `ADMIN_TELEGRAM_IDS` — по желанию. `NODE_ENV=production` и `TZ=Asia/Tashkent` уже стоят,
`BACKUP_DIR=/mnt/c/KapelkaBackup` — тоже: саму папку и таймер ставит раздел [«Бэкап»](#бэкап-ft-157).
Значения нигде не печатать и в репозиторий не класть.

> **До переезда опрос выключен.** Шаблон ставит `ENABLE_TELEGRAM_POLLING=false`. `TG_BOT_API_KEY` и
> `TG_BOT_USERNAME` бота Kapelka можно вписать, как только бот заведён, или оставить пустыми до переезда. С маком бот
> не спорит: у живого экземпляра на маке свой токен (@FinanceTrackerDevBot). Но всё, что записано в Kapelka до
> переезда, ляжет в пустую базу ПК и пропадёт, когда её заменит база с мака. Включение бота — раздел
> [«Переезд»](#переезд-включить-бота-ft-159).
>
> Отрепетировать всё целиком, с ботом и Mini App, можно на самом боте Kapelka: его токен и username в `.env.local`,
> `ENABLE_TELEGRAM_POLLING=true`, шаг 7 — со своим `--chat-id`. Записи репетиции пропадут при переносе базы; траты
> до переезда по-прежнему пишутся в @FinanceTrackerDevBot.

**Shortcut для iPhone (FT-155).** `SHORTCUT_CAPTURE_TOKEN` (`openssl rand -hex 32`, не короче 32 символов) и
`SHORTCUT_CAPTURE_OWNER` (свой id; он должен быть в `ALLOWED_TELEGRAM_IDS`). Задавать обе или ни одной: обе пустые —
Shortcut выключен (`403 SHORTCUT_CAPTURE_DISABLED`), а неполная или неверная настройка в production останавливает
старт. С `Restart=always` это цикл перезапусков — `journalctl -u kapelka.service -n 20` покажет
`Configuration validation failed` и список ошибок. Отзыв токена — новое значение и
`sudo systemctl restart kapelka.service`: старый перестаёт работать сразу. Сам Shortcut —
[`docs/IOS_SHORTCUT_ACTION_BUTTON.md`](../../IOS_SHORTCUT_ACTION_BUTTON.md) (FT-160).

## 6. Сборка и сервис systemd

`npm ci` в шаге 4 уже собрал webapp (это делает `postinstall`); осталось собрать сервер и поставить сервис:

```bash
cd ~/dev/projects/kapelka-live
scripts/nvm-exec.sh npm run build
sed -e "s|__USER__|$USER|g" -e "s|__APP_DIR__|$HOME/dev/projects/kapelka-live|g" ops/live/kapelka.service \
  | sudo tee /etc/systemd/system/kapelka.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now kapelka.service
systemctl status kapelka.service --no-pager
journalctl -u kapelka.service -f  # Ctrl+C — выйти; без группы adm — sudo journalctl …
```

Готово, когда в журнале есть `Server started`, а проверка отвечает `"environment":"production"` и до переезда —
`"telegramBot":{"state":"disabled"` (с пустым токеном ещё `"lastError":"TG_BOT_API_KEY missing"`). На репетиции и
после переезда — `"state":"running"`.

```bash
curl -s http://127.0.0.1:3000/api/health
git tag -f live-good             # эта сборка работает: на неё откатываться (дальше тег двигает live-update.sh)
```

Первый запуск создаёт пустую базу `data/database.sqlite`; записи с мака переезжают в FT-159. Если шаблон
`ops/live/kapelka.service` в репозитории изменился, unit ставится той же командой `sed … | sudo tee …`, затем
`sudo systemctl daemon-reload && sudo systemctl restart kapelka.service`.

## 7. Кнопка меню

Когда в `.env.local` есть токен бота Kapelka — при переезде (раздел [«Переезд»](#переезд-включить-бота-ft-159)) или
для репетиции. Кнопка меню @FinanceTrackerDevBot остаётся маку. Делается один раз — адрес постоянный:

```bash
cd ~/dev/projects/kapelka-live
scripts/nvm-exec.sh npm run miniapp:menu -- set --url=https://<пк>.<tailnet>.ts.net --chat-id=<ваш id>
sudo systemctl restart kapelka.service
scripts/nvm-exec.sh npm run miniapp:menu -- status --chat-id=<ваш id>
```

`set` пишет `WEB_APP_URL` в `.env.local` этой копии — файл, который читает приложение, — и ставит кнопку с текстом из
`MINIAPP_MENU_TEXT` («Kapelka»). Сервер читает `WEB_APP_URL` при старте, поэтому после `set` — перезапуск.

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
Register-ScheduledTask -TaskName 'Kapelka WSL' -Action $action -Trigger $triggers -Settings $settings `
  -User $user -Password $cred.GetNetworkCredential().Password -RunLevel Limited
Start-ScheduledTask -TaskName 'Kapelka WSL'
Get-ScheduledTask -TaskName 'Kapelka WSL' | Select-Object TaskName, State
```

- `State` должен быть `Running`. `Ready` значит, что `wsl.exe` завершился и WSL снова может погаснуть.
- Задача запускает в дистрибутиве `sleep infinity` и висит, пока он работает: пока жив этот `wsl.exe`, WSL не гасит
  дистрибутив, а systemd держит `kapelka.service`. Сами службы systemd WSL не держат
  ([Microsoft](https://learn.microsoft.com/en-us/windows/wsl/systemd)).
- Задача идёт от вашей учётки: дистрибутивы WSL у каждого пользователя свои. С паролем она запускается независимо от
  того, вошёл ли пользователь, и без окна.
- `ExecutionTimeLimit` 0 — без ограничения: по умолчанию Планировщик останавливает задачу через 72 часа
  ([Microsoft](https://learn.microsoft.com/en-us/windows/win32/taskschd/tasksettings-executiontimelimit)).
- Триггер «При входе» — запасной, на случай быстрого запуска; второй экземпляр не стартует (`IgnoreNew`).
- После `wsl --shutdown` задача завершается — запустить снова: `Start-ScheduledTask -TaskName 'Kapelka WSL'`.
- Сменили пароль Windows — обновить его в задаче:
  `$cred = Get-Credential -UserName $user; Set-ScheduledTask -TaskName 'Kapelka WSL' -User $user -Password $cred.GetNetworkCredential().Password`.

### Если задача не работает

```powershell
Get-ScheduledTaskInfo -TaskName 'Kapelka WSL' | Select-Object LastRunTime, LastTaskResult, NumberOfMissedRuns
wsl -l -v
```

`LastTaskResult` PowerShell печатает десятичным числом
([коды Планировщика](https://learn.microsoft.com/en-us/windows/win32/taskschd/task-scheduler-error-and-success-constants)):

| `LastTaskResult` | Что значит |
|---|---|
| `267009` (`0x41301`) | Задача работает — так и должно быть |
| `267011` (`0x41303`) | Задача ещё не запускалась: `Start-ScheduledTask -TaskName 'Kapelka WSL'` |
| `0` | `wsl.exe` завершился штатно — WSL больше не держится. Обычно после `wsl --shutdown`: запустить задачу снова |
| `267014` (`0x41306`) | Задачу остановили вручную (`Stop-ScheduledTask` или в окне Планировщика) |
| `2147943726` (`0x8007052E`) | Неверное имя пользователя или пароль — см. ниже |
| другое | `wsl.exe` завершился с ошибкой: выполнить в PowerShell ту же команду `wsl.exe -d Ubuntu --exec /bin/sleep infinity` и прочитать ответ (например, неверное имя дистрибутива) |

**«Неверное имя пользователя или пароль»** при `Register-ScheduledTask` или в `LastTaskResult`. Нужен пароль
учётной записи Windows: для учётки Microsoft — пароль от неё, PIN и Windows Hello не подходят. Если вход настроен
только через Windows Hello и пароль не принимается, выключить «Для повышения безопасности разрешить вход только с
помощью Windows Hello для учётных записей Microsoft» (Параметры → Учётные записи → Варианты входа) и
зарегистрировать задачу снова, добавив `-Force`. Не проверено на ПК Шукура.

**Задача `Running`, а WSL всё равно гаснет** (`wsl -l -v` — `Stopped`, хотя задача работает): запасной путь —
запретить WSL гасить простаивающий дистрибутив. В `%UserProfile%\.wslconfig`:

```ini
[general]
instanceIdleTimeout=-1
```

Затем `wsl --shutdown` и `Start-ScheduledTask -TaskName 'Kapelka WSL'`. Ключ и секция — по
[Microsoft Learn](https://learn.microsoft.com/en-us/windows/wsl/wsl-config) (`instanceIdleTimeout`, по умолчанию
15000 мс, `-1` выключает автоматическую остановку); работает ли он на версии WSL этого ПК, не проверено. Задача при
старте системы всё равно нужна — она запускает WSL.

## 9. Проверка

1. PowerShell: `curl.exe -s http://127.0.0.1:3000/api/health` — тот же ответ, что в WSL. Так проверяется доступ
   Windows к серверу в WSL, на котором стоит `tailscale serve`.
2. iPhone с включённым Tailscale: `https://<пк>.<tailnet>.ts.net/api/health` в Safari. Mini App по кнопке меню — когда
   бот включён (на репетиции или после переезда).
3. **Перезагрузка.** Перезагрузить Windows и не входить (или войти, но не открывать Ubuntu). Через пару минут с
   iPhone: `https://<пк>.<tailnet>.ts.net/api/health` отвечает; на репетиции или после переезда — бот отвечает
   на сообщение, Mini App открывается по кнопке меню. Потом в PowerShell: `Get-ScheduledTask -TaskName 'Kapelka WSL'` —
   `Running`, `wsl -l -v` — `Running`; в WSL `systemctl status kapelka.service` — `active (running)` с момента загрузки.

Если в пункте 1 Windows не получает ответа, а `curl` внутри WSL получает, значит, проброс `localhost` из WSL не
работает. Тогда — зеркальный режим сети (Windows 11 22H2+): в `%UserProfile%\.wslconfig`

```ini
[wsl2]
networkingMode=mirrored
```

затем `wsl --shutdown` и `Start-ScheduledTask -TaskName 'Kapelka WSL'`. В этом режиме `127.0.0.1` у Windows и WSL общий
([Microsoft](https://learn.microsoft.com/en-us/windows/wsl/networking)); входящие из сети в WSL закрыты брандмауэром
Hyper-V, пока их не разрешить, — и разрешать не нужно.

## Переезд: включить бота (FT-159)

Живой бот меняется: на ПК — новый бот Kapelka, @FinanceTrackerDevBot отходит маку для разработки (решение
2026-10-28). Порядок важен: база с мака ложится на ПК до того, как Kapelka начнёт принимать записи. Подробности
переноса базы — FT-159; здесь — бот. Живой экземпляр на маке, обновлённый до переезда, уже пишет «Kapelka» в чате
@FinanceTrackerDevBot — это только надписи, данные и вход не меняются, так что обновлять его можно.

1. **Завести бота в BotFather** — руками Шукура, можно заранее. В Telegram открыть @BotFather:
   - `/newbot` → имя `Kapelka` → username `kapelkabot`; если занят — свободный вариант (`kapelkaappbot`,
     `kapelka_app_bot`…). BotFather пришлёт токен: сразу в `Personal/Secrets`, нигде не печатать.
   - По желанию: `/setname` — то же «Kapelka»; `/setdescription` — что человек видит до первого `/start` (например,
     «Учёт расходов и доходов: пишите траты сюда, как в заметках»); `/setabouttext` — строка в профиле;
     `/setuserpic` — картинка. Меню команд (`/today`, `/month`, `/undo`, `/help`, `/start`) бот ставит сам при старте,
     `/setcommands` не нужен.
2. **Остановить живой экземпляр на маке** (`kill -TERM` процессу `scripts/dev-miniapp.js`, `pgrep -fl dev-miniapp.js`)
   и убедиться, что он не запустится снова.
3. **Перенести базу с мака** на ПК в `~/dev/projects/kapelka-live/data/` при остановленном `kapelka.service`
   (FT-159) — до того, как ПК начнёт принимать сообщения.
4. **Очистить `bot_messages` в перенесённой базе** — сервис всё ещё остановлен, до первого запуска с ботом Kapelka
   («да» Шукура 2026-10-28):

   ```bash
   sqlite3 ~/dev/projects/kapelka-live/data/database.sqlite "DELETE FROM bot_messages;"
   sqlite3 ~/dev/projects/kapelka-live/data/database.sqlite "SELECT count(*) FROM bot_messages;"   # 0
   ```

   Таблица помнит, какие записи показаны в каком сообщении бота. Чат тот же (Telegram id пользователя), а номера
   сообщений нового бота начнутся с 1 и совпадут со старыми: кнопки «Изменить» и «Отменить», `/undo` и ответ на
   открытый вопрос «Сколько?» нашли бы старые сообщения. Записи, счета и настройки таблица не трогает; кнопки под
   старыми сообщениями остаются в чате @FinanceTrackerDevBot, и ПК их не получает.
5. В `~/dev/projects/kapelka-live/.env.local`: `TG_BOT_API_KEY` и `TG_BOT_USERNAME` (без `@`) бота Kapelka из шага 1 и
   `ENABLE_TELEGRAM_POLLING=true`. С включённым опросом и пустым токеном production не стартует (FT-167): в журнале
   `Configuration validation failed` и `TG_BOT_API_KEY is required in production`.
6. `sudo systemctl restart kapelka.service`, затем `curl -s http://127.0.0.1:3000/api/health` — `"state":"running"`.
7. Шаг 7: `miniapp:menu -- set` с адресом tailnet и своим `--chat-id`, затем `sudo systemctl restart kapelka.service`.
8. В Telegram открыть бота Kapelka и отправить `/start`: пока его не нажали, бот не может писать первым — итоги дня и
   напоминания не дойдут. Проверить ответ бота, «кофе 25000», Mini App по кнопке меню, потом проверку 9.3 с
   перезагрузкой.
9. Мак дальше работает с @FinanceTrackerDevBot как ботом для разработки и со своей базой (FT-159). Старая переписка
   остаётся в чате с @FinanceTrackerDevBot; записи из неё — в базе ПК, в Kapelka.

**Откат переезда.** `sudo systemctl stop kapelka.service` → забрать базу с ПК на мак (`sqlite3 … ".backup …"`) → в
`.env.local` мака `TG_BOT_API_KEY` и `TG_BOT_USERNAME` бота Kapelka → `dev:miniapp` на маке. Именно Kapelka, а не
@FinanceTrackerDevBot: пользователь уже пишет в Kapelka, и бот, которого никто не опрашивает, молчит. Сервис на ПК —
остановленным, иначе два процесса делят один токен (409). `bot_messages` второй раз чистить не нужно: бот тот же,
номера сообщений в базе — его.

## Обновление

```bash
cd ~/dev/projects/kapelka-live
scripts/live-update.sh
```

Скрипт:

1. Отказывается работать не на `main`, с изменёнными или лишними файлами в дереве и без `.env.local`. Сразу
   спрашивает пароль sudo (`sudo -v`) — он нужен в конце для перезапуска, а не через несколько минут сборки.
2. `git pull --ff-only origin main` — и показывает новые коммиты. Отказывается, если в копии есть свои коммиты,
   которых нет в `origin/main`: живая копия — это `main` как в GitHub.
3. Проверяет, что Node из `.nvmrc` установлен: если `.nvmrc` сменился, подскажет `nvm install` и остановится до сборки.
4. `npm ci --include=dev` (его `postinstall` ставит и собирает webapp; скрипт проверяет, что `public/webapp`
   пересобран) и `npm run build` — на Node из `.nvmrc`. `--include=dev` нужен, чтобы TypeScript и Vite ставились,
   даже если в оболочке выставлен `NODE_ENV=production`. Между ними скрипт загружает `sqlite3`: `npm ci` не
   замечает нативную сборку, которая здесь не грузится (FT-048), и без проверки новый сервис не поднялся бы.
5. `sudo systemctl reset-failed` и `restart kapelka.service`. `reset-failed` — на случай, если сервис остановлен
   лимитом стартов; заодно паузы перезапуска снова начинаются с 10 с.
6. Ждёт до 60 с, пока `/api/health` ответит 200, и печатает окружение и состояние бота.
7. Только после ответа 200 переставляет локальный тег `live-good` на новый коммит. Это последняя сборка, которая точно
   работала, — на неё откатываются. Скрипт печатает её при любой неудаче, в том числе при повторном запуске после
   неудачного обновления, когда «коммит до запуска» был бы уже сломанным.

Миграции применяет само приложение на старте: сначала копирует `data/database.sqlite` в
`data/backups/database-<дата>-<время>.sqlite`, в журнале — `Database migrations applied` с `backupPath`. Пока идёт
сборка (пара минут), работает старая версия; бот молчит только на время перезапуска, а пришедшие сообщения Telegram
отдаст после старта. Сообщение, которое бот обрабатывает в момент перезапуска, он доделывает (до 5 с), и только потом
закрывается база (FT-167); не успел — Telegram пришлёт его снова, и бот не запишет его второй раз. Без новых коммитов
скрипт всё равно пересобирает и перезапускает — так повторный запуск чинит прерванное обновление. Автообновления нет
намеренно (решение 2026-10-26): миграции применяются под присмотром.

Если сборка упала, сервис продолжает старую версию из памяти, но следующий его старт (сбой, перезагрузка) возьмёт
сломанную сборку. Сразу исправить и повторить или откатиться.

**Обновление на `sqlite3` 6 (FT-048).** На ПК Ubuntu 24.04, glibc 2.39 (проверено 2026-10-31) — ничего делать не
нужно. Дальше — только для 22.04: до обновления `echo build_from_source=sqlite3 >> ~/.npmrc`
([шаг 4](#4-wsl-node-и-копия-devprojectskapelka-live)). Без этой строки скрипт остановится до перезапуска на
`the native sqlite3 module does not load`, старая версия продолжит работать, а `live-good` останется на прошлой
сборке. Тогда — строчка в `~/.npmrc` и `scripts/live-update.sh` ещё раз, или [откат](#откат) на `live-good`. Сам
FT-048 миграций не добавляет, а базу, записанную `sqlite3` 6, прежний `sqlite3` 5 открывает и пишет.

## Откат

Откатываются на тег `live-good` — последнюю сборку, которая ответила 200 (`git log -1 --oneline live-good`). Его
ставит шаг 6 при установке и двигает `live-update.sh`. Нет тега — прошлый коммит из `git reflog`. Всё — в
`~/dev/projects/kapelka-live`.

1. Остановить сервис: `sudo systemctl stop kapelka.service`.
2. Проверить, применило ли обновление миграции:
   `journalctl -u kapelka.service --grep "migrations applied" --no-pager | tail -n 3` — запись со временем обновления,
   в ней `applied` (какие) и `backupPath` (копия базы до них). Если миграций не было — сразу шаг 3. Если были, старому
   коду нужна старая схема, и путей два:
   - **сохранить записи, сделанные после обновления** — сейчас, ещё на новой версии:
     `scripts/nvm-exec.sh npm run migration:revert`. Отменяет последнюю миграцию, перед этим сам копирует базу в
     `data/backups/`. Миграций было несколько — повторить по числу `applied`;
   - **вернуть базу как была до обновления** (записи после него пропадут) — после шага 3:

     ```bash
     cp data/database.sqlite "data/backups/database-before-rollback-$(date +%Y%m%d-%H%M%S).sqlite"
     cp <backupPath из журнала> data/database.sqlite
     ```

3. Вернуть код и собрать:

   ```bash
   git switch --detach live-good
   scripts/nvm-exec.sh npm ci --include=dev   # и webapp — через postinstall
   scripts/nvm-exec.sh npm run build
   ```

4. Запустить: `sudo systemctl start kapelka.service`, проверить `curl -s http://127.0.0.1:3000/api/health`.

Пока копия на откате, `live-update.sh` отказывается работать (не `main`) — новая версия не вернётся случайно. Когда
исправление в `main`: `git switch main && scripts/live-update.sh`.

## Логи и состояние

```bash
systemctl status kapelka.service --no-pager
journalctl -u kapelka.service -f                      # следить
journalctl -u kapelka.service -b --no-pager           # с последней загрузки
journalctl -u kapelka.service --since "1 hour ago" --no-pager
journalctl -u kapelka.service --grep '"level":"error"' --no-pager
systemctl show kapelka.service -p NRestarts           # сколько раз systemd его перезапускал
```

В production приложение пишет JSON — по строке на событие. Системный журнал читают пользователи группы `adm` (в
Ubuntu первый пользователь в ней); если `journalctl -u kapelka.service` пуст или пишет про права — `sudo journalctl …`.
Сервис `failed` после лимита стартов:
`sudo systemctl reset-failed kapelka.service && sudo systemctl start kapelka.service` — сначала причину в журнале.

Кого не пустил `ALLOWED_TELEGRAM_IDS`: `journalctl -u kapelka.service --grep "not allowed" --no-pager | tail -n 20`.
Каждый чужой id — строка сразу при первом отказе; его повторы за 10 минут — одна строка `(repeats)` с `skipped`
(FT-166), так что тот, кто засыпает бота или API, не наполнит журнал. Подробнее —
[Troubleshooting → Who was turned away](troubleshooting.md#who-was-turned-away-by-allowed_telegram_ids).

### Адрес клиента и лимиты запросов

`tailscale serve` ставит запросу заголовок `X-Forwarded-For` с адресом устройства в tailnet (`100.x.y.z`) и
перезаписывает присланный клиентом, так что подделать его нельзя; ещё — `X-Forwarded-Proto: https` и
`X-Forwarded-Host` (исходники Tailscale, `ipn/ipnlocal/serve.go`, `addProxyForwardedHeaders`). Приложение стоит с
`trust proxy` = 1 (`src/index.ts`): адрес клиента — последний в `X-Forwarded-For`, то есть адрес устройства, а не
`127.0.0.1` прокси.

Поэтому лимиты по адресу считаются на устройство. Лимит запросов к ИИ — 20 за 15 минут (`aiRateLimiter`): Mini App и
Shortcut с одного iPhone делят его, браузер на маке считается отдельно. Голос и текст в боте через HTTP не идут и под
этот лимит не попадают. Превышение — ответ `429 AI_RATE_LIMIT_EXCEEDED` и в журнале `AI rate limit exceeded` с полем
`ip`.

Проверить: `journalctl -u kapelka.service --grep "rate limit" --no-pager` — в `ip` должен быть адрес устройства из
`tailscale status`. Если там `127.0.0.1` или `::ffff:127.0.0.1`, адрес клиента не доходит, и все устройства делят один
лимит. Тогда — задача на код (`trust proxy` и ключ лимитера), не правка на ПК.

IPv6: express-rate-limit 8.6.2 сворачивает адрес IPv6 в подсеть `/56`, а все IPv6-адреса Tailscale лежат в
`fd7a:115c:a1e0::/48`. Если устройство ходит в tailnet по IPv6, в `ip` будет `fd7a:…`, и все такие устройства делят
один лимит. Это тоже задача на код, не на ПК.

## Бэкап (FT-157)

Раз в сутки `kapelka-backup.timer` запускает [`scripts/backup-db.sh`](../../../scripts/backup-db.sh): онлайн-копия
`data/database.sqlite` (`sqlite3 … ".backup …"` — безопасно, пока приложение пишет) → `PRAGMA integrity_check` — `ok` →
вместе с `data/patterns.json` и `data/learning-data.json` в папку `C:\KapelkaBackup` (в WSL — `/mnt/c/KapelkaBackup`).
Google Drive for desktop выгружает эту папку в облако. Хранятся последние 30 копий.

Зачем: весь WSL — один файл `ext4.vhdx`. `wsl --unregister`, переустановка Windows или отказ диска уносят базу, а
копии, которые приложение делает перед миграциями, лежат в `data/backups/` — там же.

- **Живую базу в облачную папку не класть.** Ни `data/`, ни `~/dev/projects/kapelka-live` целиком не должны лежать в
  папке, которую синхронизирует Google Drive (или OneDrive, Dropbox): клиент синхронизации копирует файл посреди записи
  и может подменить его своей версией, а SQLite от этого портится. В облако идут только готовые копии, снятые
  `sqlite3 … ".backup …"`, — это и делает скрипт.

Файлы: [`ops/live/kapelka-backup.service`](../../../ops/live/kapelka-backup.service) — шаблон сервиса (те же
`__USER__` и `__APP_DIR__`, что у `kapelka.service`),
[`ops/live/kapelka-backup.timer`](../../../ops/live/kapelka-backup.timer) — таймер.

### Почему так

- **Папка на C:, которую синхронизирует Google Drive, а не диск `G:`.** У Google Drive for desktop три способа:
  - Потоковый «Мой диск» (по умолчанию) — виртуальный диск, в Windows обычно `G:`
    ([Google](https://support.google.com/drive/answer/2565956)). Он есть, только пока Drive for desktop запущен, то есть
    после входа в Windows, а ПК работает и без входа. В WSL сам в `/mnt/g` он может не появиться — нужен ручной
    `mount -t drvfs G: /mnt/g`, который не переживает перезапуск WSL (по отзывам, на разных сборках по-разному; не
    проверено). Ночью копии было бы некуда писать.
  - Зеркальный «Мой диск» — обычная папка, но тогда на ПК скачивается весь Google Drive, а путь лежит в профиле
    пользователя и с пробелом (`My Drive`).
  - **Папки с компьютера** — выбран этот. Любая локальная папка синхронизируется с Drive; такие папки только
    зеркалятся ([Google](https://support.google.com/drive/answer/13401938)), в веб-версии Drive они видны в разделе
    «Компьютеры». `C:\KapelkaBackup` — обычная папка на C: без пробелов и без имени пользователя, в WSL она есть всегда
    (`/mnt/c` монтируется сам), а «Мой диск» остаётся потоковым.
- **Когда копия попадает в облако.** На C: скрипт пишет в любое время — копия вне `ext4.vhdx` появляется сразу и
  переживает `wsl --unregister` и порчу `vhdx`. В облако её выгружает Drive for desktop, а он работает только в сеансе
  пользователя: запускается при входе в Windows. Пока в Windows никто не входил, копии копятся на C: и уходят в облако
  при входе. До этого от отказа диска или переустановки Windows они не спасают: `vhdx` и C: обычно на одном диске.
  Так устроено приложение; на ПК Шукура не проверено. Не проверено и то, что Drive замечает файлы, записанные из WSL
  (через `/mnt/c` пишет сама Windows, поэтому должен).
- **`BACKUP_DIR` — в `.env.local`, а не в unit-файле.** Все настройки живой копии — в одном файле, который и так правят
  (шаг 5). Сменить папку можно без `sudo` и `daemon-reload`; скрипт, запущенный руками, видит ту же папку, что и
  таймер; unit остаётся шаблоном, и его переустановка (`sed … | sudo tee …`) не сотрёт путь. Приложение `BACKUP_DIR`
  не читает. Переменная окружения с тем же именем важнее файла.
- **Скрипт не создаёт папку и не пишет на диск WSL.** Если `/mnt/c` вдруг не смонтирован, `mkdir -p` создал бы папку
  внутри `ext4.vhdx`: копия лежала бы рядом с базой, а выглядела бы бэкапом. Поэтому `BACKUP_DIR` не задан, пустой,
  не абсолютный, такой папки нет, в неё нельзя писать, она на том же диске, что `data/`, — ошибка с понятным текстом,
  код 1, сервис `failed`, в журнале — причина.
- **Копия проверена, недописанный файл не уходит.** Копия снимается во временную папку WSL и проверяется
  `PRAGMA integrity_check`; не `ok` — в облачную папку не пишется ничего. Если ПК выключили посреди записи, рядом с
  базой остаётся «горячий» журнал: скрипт открывает базу не только на чтение и откатывает его, как приложение на
  старте, — иначе копия, догоняющая пропуск сразу после включения, падала бы. JSON-файлы проверяются на
  целостность: приложение могло писать их в эту секунду, поэтому до трёх попыток; так и не целый файл не копируется,
  база — копируется, а запуск завершается ошибкой. Каждый файл сначала пишется в той же папке под временным именем
  `.kapelka-….partial`, сверяется с проверенной копией и переименовывается; база — последней, поэтому `.sqlite` в
  папке значит, что JSON того же запуска рядом. Запуск один за раз (`flock` на `data/backups/.backup-db.lock`):
  второй, ручной или по таймеру, пишет `another backup is running` и выходит с кодом 1. `sqlite3` вызывается с
  `-init /dev/null`: `.headers` или `.mode` из `~/.sqliterc` сломали бы проверки.
- **Предупреждения в журнале, без отказа.** `WARNING: this copy has N records, the previous one … has M` — в новой копии
  записей меньше половины, чем в самой свежей копии в папке: похоже на пустую базу после переустановки WSL, её копии
  вытеснили бы хорошие (раздел «Восстановление»). `WARNING: the clock is behind the newest copy` — часы WSL отстали;
  копия этого запуска всё равно не удаляется, даже если по имени она старше тридцатой.
- **30 копий — это 30 запусков, а не 30 дней.** Имена `kapelka-ГГГГММДД-ЧЧММСС.sqlite`, рядом `.patterns.json` и
  `.learning-data.json` того же запуска; время ташкентское (`TZ` из `.env.local`). Удаляются копии старше тридцатой, и
  только файлы с таким именем — остальное в папке скрипт не трогает. Считаются все запуски: ночной, догоняющий после
  включения и ручные. ПК включён не каждый день, поэтому по календарю это обычно больше 30 дней, а после нескольких
  ручных запусков подряд — меньше.
- **Google Drive синхронизирует в обе стороны.** Удаление по сроку уходит и в облако — там тоже 30. И наоборот:
  удалили копии на drive.google.com или в приложении Drive на iPhone — они удаляются и из `C:\KapelkaBackup`. Вернуть их
  можно из корзины Google Drive: удалённое хранится там 30 дней.
- **Таймер.** 04:00 по Ташкенту — зона записана в таймере, часовой пояс WSL не важен; в это время записи не пишут.
  `Persistent=true`: если в 04:00 ПК выключен, копия снимается сразу после старта WSL, один раз. `RandomizedDelaySec`
  не задан: он разносит во времени запуски многих машин, а машина одна; после включения он только отложил бы
  пропущенный запуск, и ПК, выключенный в эти минуты, пропустил бы его снова. `Nice=10` и `IOSchedulingClass=idle` —
  приложение и бот важнее (класс ввода-вывода действует не на всех дисках, но и не мешает); `TimeoutStartSec=30min` —
  зависший `/mnt/c` не держит следующие запуски.

### Установка

1. **Windows: папка и Google Drive.**
   1. Создать папку `C:\KapelkaBackup` — в Проводнике или в PowerShell: `New-Item -ItemType Directory C:\KapelkaBackup`.
   2. Установить Google Drive for desktop (google.com/drive/download) и войти своим аккаунтом Google.
   3. Значок Drive в трее → шестерёнка → **Settings** → **Preferences** → **Folders from your computer** →
      **Add folder** → `C:\KapelkaBackup` → **Sync with Google Drive** → **Done** → **Save**. Названия — из
      английского интерфейса, в русском они звучат иначе.
   4. drive.google.com → **Компьютеры** → этот ПК → `KapelkaBackup`: папка появилась.
2. **WSL: путь, первая копия, таймер.**

   > **WSL переустановлен, а в `C:\KapelkaBackup` уже лежат копии с записями?** Сначала
   > [«Восстановление»](#восстановление), потом этот шаг. Иначе первая же копия снимется с новой пустой базы, станет
   > самой свежей, а следующие начнут вытеснять хорошие (скрипт предупредит в журнале, но не остановится).

   ```bash
   cd ~/dev/projects/kapelka-live
   grep -q '^BACKUP_DIR=' .env.local || printf '\nBACKUP_DIR=/mnt/c/KapelkaBackup\n' >> .env.local
   ls -ld /mnt/c/KapelkaBackup       # папка видна из WSL
   scripts/backup-db.sh             # первая копия руками: «done: … integrity ok»
   for unit in kapelka-backup.service kapelka-backup.timer; do
     sed -e "s|__USER__|$USER|g" -e "s|__APP_DIR__|$HOME/dev/projects/kapelka-live|g" "ops/live/$unit" \
       | sudo tee "/etc/systemd/system/$unit" >/dev/null
   done
   sudo systemctl daemon-reload
   sudo systemctl enable --now kapelka-backup.timer
   sudo systemctl start kapelka-backup.service   # копия через systemd — так же, как ночью
   systemctl list-timers kapelka-backup.timer    # NEXT — ближайшие 04:00 по Ташкенту
   ```

   `.env.local`, сделанный из шаблона после FT-157, строку `BACKUP_DIR` уже содержит — `grep` её не задвоит.
   `systemctl start` ждёт конца копии; при ошибке он пишет `Job for kapelka-backup.service failed`, причина —
   `journalctl -u kapelka-backup.service -n 5`. Пока вы в Windows, Drive выгрузит файлы, и они появятся в
   drive.google.com → Компьютеры → этот ПК → `KapelkaBackup`.

Скрипт обновляется вместе с `main` (`live-update.sh`). Если изменились шаблоны в `ops/live/`, их ставит тот же цикл
`sed … | sudo tee …`, затем `sudo systemctl daemon-reload`. Выключить бэкап: `sudo systemctl disable --now
kapelka-backup.timer`.

### Проверить, что бэкап идёт

```bash
systemctl list-timers kapelka-backup.timer             # LAST — последний запуск, NEXT — следующий
systemctl status kapelka-backup.service --no-pager     # последний результат: success или failed
journalctl -u kapelka-backup.service -n 20 --no-pager  # «done: …», WARNING или причина ошибки
ls -lt /mnt/c/KapelkaBackup | head -n 4                # свежие файлы на C:
```

`WARNING` в журнале — запуск прошёл, но что-то не так: см. «Предупреждения в журнале» выше.

С iPhone: приложение Google Drive → Компьютеры → ПК → `KapelkaBackup` — дата последнего файла. На C: свежие, а в облаке
старые — Drive for desktop не запущен (в Windows никто не входил) или поставлен на паузу.

Оповещения о сбое нет: упавший бэкап виден только здесь и в папке. Раз в неделю заглядывать в `list-timers` или в
папку на iPhone.

### Восстановление

Пример — копия из `C:\KapelkaBackup`. Всё в WSL, в `~/dev/projects/kapelka-live`.

- **Сначала восстановить, потом ставить таймер.** После переустановки WSL установка FT-156 создаёт пустую базу; если
  поставить бэкап раньше, её копии станут самыми свежими и начнут вытеснять хорошие. Таймер уже стоит — остановить его
  на время: `sudo systemctl stop kapelka-backup.timer`, вернуть — `sudo systemctl start kapelka-backup.timer`.
- **Копию выбирать по дате до потери и по числу записей**, а не просто нижнюю в списке: последние копии могли сняться
  уже с пустой или испорченной базы.

```bash
cd ~/dev/projects/kapelka-live
sudo systemctl stop kapelka.service
for f in /mnt/c/KapelkaBackup/kapelka-[0-9]*.sqlite; do
  echo "$f $(sqlite3 -readonly "$f" 'SELECT count(*) FROM transactions;')"
done | tail -n 10                                             # копия и число записей, свежая внизу
copy=/mnt/c/KapelkaBackup/kapelka-20261028-040000.sqlite        # выбранная копия
sqlite3 -readonly "$copy" 'PRAGMA integrity_check;'           # ok
sqlite3 -readonly "$copy" 'SELECT count(*) FROM transactions;'
old="data/backups/before-restore-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$old" && mv data/database.sqlite* "$old"/           # текущая база и её журнал — в сторону
cp "$copy" data/database.sqlite                               # без sudo: владелец — вы
ls -l data/database.sqlite
sudo systemctl start kapelka.service
curl -s http://127.0.0.1:3000/api/health
sqlite3 -readonly data/database.sqlite 'SELECT count(*) FROM transactions;'   # столько же, сколько в копии
```

- `mv data/database.sqlite*` уносит и `database.sqlite-journal`, если он есть: SQLite «докатил» бы журнал старой базы в
  восстановленный файл и испортил бы его. На новом ПК базы нет — `mv` скажет, что файлов нет, это не ошибка.
- Файл скопирован через `sudo` и принадлежит `root` — приложение не сможет писать: `sudo chown "$USER:"
  data/database.sqlite`.
- JSON того же запуска, если нужны: `cp "${copy%.sqlite}.patterns.json" data/patterns.json` и так же
  `.learning-data.json`. Без них приложение берёт стартовые `data/*.seed.json`.
- Копия старее кода — приложение на старте применит миграции и перед этим само скопирует базу в `data/backups/`
  (в журнале — `Database migrations applied`).
- Записи после времени копии остаются только в `$old`. Mini App покажет записи на момент копии.
- Папки на C: нет (новый ПК, переустановка Windows): drive.google.com → Компьютеры → старый ПК → `KapelkaBackup` →
  скачать `.sqlite`. Скачанное лежит в `C:\Users\<имя>\Downloads` — в WSL `/mnt/c/Users/<имя>/Downloads/…`; дальше
  те же шаги с этим путём в `copy`. Копии удалили в Google Drive — сначала вернуть их из корзины Drive (30 дней).
- `sqlite3` на файле в `/mnt/c` отвечает `database is locked` — скопировать копию в `/tmp` и проверять там (на ПК не
  проверено).

Проверено 2026-10-28. На маке с настоящим приложением: три записи через API → копия при работающем сервере →
четвёртая запись → остановка → вместо базы чужой файл и файл журнала → шаги выше → сервер поднялся, в API три записи
из копии, новая запись пишется. В Docker на Ubuntu 24.04 с systemd 255 — тот же блок от имени пользователя сервиса,
установка по шагам, таймер с догоняющим запуском после «перезагрузки», удаление старше 30, ошибки и предупреждения в
журнале, `~/.sqliterc`, `flock`. На ПК с Windows и Google Drive не проверено.

## Если что-то не так

| Признак | Где смотреть |
|---|---|
| Бот молчит | До переезда так и должно быть (`"state":"disabled"`). После — `systemctl status kapelka.service`, `journalctl -u kapelka.service -n 50`; не опрашивает ли токен Kapelka ещё кто-то, например мак (409) |
| Бот отвечает, Mini App не открывается | Windows: `tailscale serve status`, `curl.exe -s http://127.0.0.1:3000/api/health`; на iPhone включён Tailscale |
| После перезагрузки не работает ничего | `Get-ScheduledTaskInfo -TaskName 'Kapelka WSL'`, `wsl -l -v` — [«Если задача не работает»](#если-задача-не-работает); затем `systemctl status kapelka.service` |
| Сервис перезапускается по кругу | `journalctl -u kapelka.service -n 20`: `Configuration validation failed` — ошибка в `.env.local`; остальное — [Troubleshooting](troubleshooting.md#service-restarts-in-a-loop-or-is-failed) |
| `live-update.sh` отказывается или `git pull` падает | [Troubleshooting → Live Instance on the PC](troubleshooting.md#live-instance-on-the-pc) |
| Копии не появляются или в облаке старые | `systemctl list-timers kapelka-backup.timer`, `journalctl -u kapelka-backup.service -n 20` — [«Проверить, что бэкап идёт»](#проверить-что-бэкап-идёт), [Troubleshooting → Backup Fails](troubleshooting.md#backup-fails) |
