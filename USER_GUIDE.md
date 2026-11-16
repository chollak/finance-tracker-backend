# Kapelka User Guide

Kapelka keeps track of spending and income. You write a phrase («кофе 25к, такси 18к нал») to the Telegram bot or
in the Mini App, and it turns into records. The interface is in Russian, so this guide quotes the labels as you see
them.

## 1. Getting started

**Access is closed.** The bot and the app answer only the Telegram accounts on the server's list
(`ALLOWED_TELEGRAM_IDS`). The bot does not reply to anyone else at all.

**The bot.** Send `/start`. The bot explains how to write and adds the button «Открыть Kapelka ↗», which opens the
Mini App. If the chat's menu button has been set up (`npm run miniapp:menu`), it opens the Mini App too.

**First launch.** The Mini App first asks «Сколько у вас сейчас денег?»: how much you have in cash, on the card and
in dollars. These amounts are opening balances dated today, not income. Kapelka counts from them, and the accounts
«Наличные», «Карта» and «Доллары» come from this screen.

**In a browser.** If you open the app's address outside Telegram, you get the screen «Войти через Telegram». It opens
the chat with the bot, and the bot asks «Подтвердить» or «Это не я». After «Подтвердить» the page opens the app by
itself. «Ещё» → «Аккаунт» → «Выйти» signs out of this browser only, and the records stay.

## 2. Recording in the bot

**Text.** Write as you would in a note. You can put several records in one message, separated by commas:

```
такси 18к
обед 45 000 картой
кофе 25к, такси 18к нал
зарплата 12,5 млн
наушники 55$
вчера продукты 186 400
```

- «к» means thousands, and «млн» means millions. Amounts are in сум unless you add «$».
- «нал», «картой» or an account's name chooses the account. Otherwise the record goes to the default account
  («Ещё» → «Счёт по умолчанию»), and dollars go to a dollar account.
- «вчера» or a date puts the record on another day. Without one, it goes on today.

**Voice.** Send a voice message and say the same thing: «такси восемнадцать тысяч». Speech is recognised as Russian.

**What the bot answers.** The bot writes the records at once and replies with what it wrote. Under the reply are
buttons:

- one record: «Изменить» and «Отменить»;
- several records: one button per record, then «Отменить все»;
- a cancelled record: «Вернуть»;
- «Изменить» opens «Сумму», «Категорию», «Дату», «Открыть в Kapelka ↗», «Готово» and «Отменить запись» (or
  «Отменить «Такси»» when the message has several records). «Счёт» is there too when you have another account in the
  record's currency.

**When the bot asks:**

- **It guessed the category.** The record is written, and the bot asks with «Да, верно» or «Другая». When the
  category is «Другое», it shows «Выбрать категорию».
- **You named something without an amount** («кофе 25к, такси»). It writes the rest and asks «Сколько?» about the
  item. Answer with a number, or press «Пропустить «Такси»».
- **The amount looks too large** for everyday spending: from 10 000 000 сум in «Кафе», «Транспорт», «Продукты»,
  «Связь» or «Здоровье». It writes nothing until you press «Это 25 000 сум» (a thousand times less), «Да, верная» or
  «Не записывать».

**Changing an amount by text.** Write «не 25, а 28». Anything else you change with «Изменить» under the record.

**Commands** (the «/» menu in the message field):

| Command | What it does |
|---|---|
| `/today` | Today's summary: spent, how many records, the top categories |
| `/month` | Spending this month against the same days of the month before |
| `/undo` | Cancels the records of your last message in the chat that still has any («кофе 25к, такси 18к» — both), with «Вернуть» |
| `/help` | How to write |
| `/start` | What the bot does, and «Открыть Kapelka ↗» |

**What the bot sends on its own.** You switch these on and off in «Ещё» → «Бот в Telegram». Times are Tashkent time.

- «Сводка дня»: every evening at the time you choose (20:00–23:00), what the day was spent on. On a day without
  records it asks whether there really was no spending.
- «Звать на ревизию»: on the 1st of each month, an invitation to the spending audit of the month before.
- «Цели и подписки»: a warning when spending on an audit goal gets close to its limit, and the day before a charge for
  a subscription you decided to cancel.

Apart from these, the bot only writes in reply to your messages.

## 3. The Mini App

### Home (`/`)

- At the top: the Kapelka sign, «Сум / USD» (the currency of the totals) and «Ещё».
- The balance card shows the total of your accounts and what share of this month's income is already spent. Its
  «N счёта» unfolds the accounts, and «Все счета и курс доллара» opens Accounts.
- Two month tiles, income and expenses, each open Analytics.
- The audit card: an invitation to the audit of the month before (with «Позже»), and «Цели после ревизии» after it.
- «Последние операции»: the five newest records by day. «Все» opens History, and a record opens its sheet.

### Recording on Home

The input at the bottom of Home has these parts:

- **Chips of frequent expenses:** a note and an amount you write often («Кофе 25 000»), in its category. Until you
  have such expenses, four starter chips stand there. One tap writes the expense for today, and the toast «Записано»
  has «Отменить».
- **The field** («Кофе 25к, такси 18к…») takes the same phrases as the bot. The arrow sends the phrase and opens
  «Проверьте записи».
- **«Ввести вручную»** opens manual entry (`/add`): the amount on the app's own keypad, with the category, account,
  date and note on the same screen.
- **The microphone and the camera** do not work in the Mini App yet. They say so: use voice in the bot, and type a
  receipt as text.

### «Проверьте записи» (`/review`)

This screen shows the records a phrase made: how many there are, and how many to check. A category with «?» is a
guess. Each record shows its amount and note, with chips for the category, account and date. A record you don't want
is removed with «×».

- «Сохранить N операций» keeps the records.
- «Изменить» or «Назад» takes them back and puts the phrase back in the field.

### A record's sheet

You open it by tapping a record on Home, in History, on an account's screen or in a category's analytics. The bot's
«Открыть в Kapelka ↗» opens it too, by the link `/?record=<id>`.

- On the sheet you see «Расход / Доход», the amount, «Категория», «Счёт», «Дата» and «Заметка».
- Every change is saved at once («Изменения сохраняются сразу»).
- «Удалить операцию» deletes the record at once. The toast «Удалено» has «Отменить», which brings it back.
- Tapping a record's category circle in a list opens the category choice straight away.

### History (`/transactions`)

- Search («Такси, кафе, 25 000…») finds every word in the note, the merchant, the category or the account. Digits
  match the start of the amount.
- The filter chips are category, account and «Тип» («Расходы» or «Доходы»).
- Records are grouped by day, each day with its total. The line under the chips counts what was found and adds it up.
  «Сбросить» clears the search and the filters.

### Analytics (`/analytics`)

- Where the month's money went: the total, a fair comparison with the previous period and one insight.
- Categories appear as bars, with a tick for the previous period. A category opens its records by day
  (`/analytics/categories/:id`).
- You can switch months and «Расходы / Доходы».
- For the audited month, a card under the expenses opens the spending audit.

### Accounts (`/accounts`)

- You see the total of the visible accounts in сум, with the dollar rate it was counted at. The rate row opens
  «Курс доллара»: the Central Bank rate, or your own.
- «Добавить счёт» asks for a name, «Наличные / Карта», «Сумы / Доллары» and «Сколько на нём сейчас» (an opening
  balance, not income).
- «Перевод или обмен» moves money between accounts. Between two currencies it is an exchange: «Отдаю / Получаю», with
  the deal rate.
- An account's screen shows:
  - its balance, its records and its moves by day;
  - «Перевести» (or «Обменять» for a dollar account);
  - «Сверить остаток»: you type what is really there, and the difference becomes an adjustment;
  - «Изменить»: rename the account, change its currency while it has no records, or hide it.
- A hidden account leaves the total and the choices, but its records stay. An account with records is hidden, never
  deleted. Hidden accounts come back from «Скрытые счета».

### Categories (`/more/categories`, from «Ещё»)

- There are 8 starter categories for expenses and 8 for income. Each one shows its records this month.
- A category opens its sheet, where you rename it, pick one of 8 colours or hide it. «Другое» cannot be hidden.
- «Добавить категорию» adds your own, and «Скрытые» brings hidden ones back.
- Every change comes with «Отменить».

### Spending audit (`/audit`)

- Once a month, Kapelka picks spendings of the month before that may have been unnecessary. It uses simple rules over
  the flexible categories («Кафе», «Транспорт», «Покупки», «Связь», «Другое»).
- You mark each one «Нужно» or «Лишнее». A repeating extra then gets «Вдвое меньше» or «Отказаться», and a subscription
  gets «Отменить».
- «Готово» shows the plan: the saving a month and the goals. The bot warns about the goals when they get close to
  their limit (see «Цели и подписки»).
- The first audit comes after a whole month of records.
- It opens from Home's card, from «Ещё» and from Analytics.

### «Ещё» (`/more`)

Every row says its current state, and a change applies at once.

- **«Деньги»:** «Счета и курс доллара», «Счёт по умолчанию» (where new records go), «Категории», «Ревизия трат».
- **«Бот в Telegram»:** «Сводка дня», «Звать на ревизию», «Цели и подписки».
- **«Вид»:** «Тема». It can follow Telegram (or the system, in a browser), or always be light or dark.
- **«Данные»:** «Скачать все записи» makes a CSV of all records with categories, accounts and the rate. Inside Telegram
  it comes to the chat with the bot. In a browser it downloads.
- **«Аккаунт»** (in a browser only): who is signed in, and «Выйти».

### Without a connection

When there is no connection, a line under Home's header says so, and Home shows what was kept on the device. Chips,
simple phrases («такси 18к», «обед 45 000, кофе 25к») and «Ввести вручную» still write. Those records show
«Ждёт связи» and go to the server once the connection is back. The microphone and the camera say they need a
connection.

## 4. iPhone

- **Action Button and Shortcuts** ([docs/IOS_SHORTCUT_ACTION_BUTTON.md](docs/IOS_SHORTCUT_ACTION_BUTTON.md)):
  - Through Telegram: you dictate or type the phrase in the Shortcut. It copies the phrase and opens the chat with
    the bot, where you paste it and send it. It needs no token and works for anyone with access.
  - Straight to the server: a Shortcut sends the phrase in one press. It is only for the server's owner: it uses a
    token bound to one Telegram account (`SHORTCUT_CAPTURE_TOKEN`, `SHORTCUT_CAPTURE_OWNER`).
- **The Kapelka app for iPhone** ([ios/README.md](ios/README.md)) is only for the owner too, with the same token:
  - a phrase or your voice is saved on the phone first, and goes to the server when it can be reached;
  - Apple Pay payments come in through the Wallet automation «Транзакция»;
  - in «Записи» you can delete a record (with «Вернуть») or change its category. Amount, account and date are changed
    in the Mini App.

## 5. How recognition works

- **A simple phrase** of one item and an amount, whose word names one category («такси 18к», «обед 45 000 картой»,
  «вчера продукты 186 400»), is read on the server itself.
- **Any other phrase** («зарплата 12,5 млн», «наушники 55$», several items) goes to an OpenAI model, together with
  the names of your visible categories. It comes back as records: the amount, the currency, income or expense, a
  category from that list, the account, the date and the note.
- **A voice message** from the bot goes to OpenAI Whisper as a recording. The text it hears then goes to the model
  like any other phrase.
- **An Apple Pay payment** from the iPhone app comes with its amount and merchant ready. Only the category is chosen:
  from your earlier corrections or the merchant's words, and otherwise by the model from the merchant's name.
- **What it cannot place** goes to «Другое». A guessed category is marked «?», so check it.
- **Kapelka learns from your corrections.** If you change a record's category in the bot, the Mini App or the iPhone
  app, the same words or the same shop get that category next time. This works for the starter categories only, not
  for a category you added. «Отменить» takes the lesson back. What it learns is shared by everyone on the server.

## 6. Data and privacy

- **Where it is kept:** one SQLite file on the server that runs Kapelka, and its backups. A copy goes to
  `data/backups/` before migrations are applied. Once the nightly backup is set up on the live instance
  ([live-instance.md](docs/knowledge-base/08-development/live-instance.md), «Бэкап»), `scripts/backup-db.sh` copies
  the database once a day to a folder synced with Google Drive.
- **What is kept:**
  - records (amount, currency, category, account, date, note, merchant), each with the phrase as written or heard, or
    the payment's merchant;
  - what the bot heard in a voice message, kept with its reply;
  - accounts and their opening balances, transfers and exchanges;
  - categories and settings;
  - the dollar rate;
  - audit marks and goals;
  - your Telegram id, name and username;
  - what was learned from your corrections;
  - how many records and voice messages you make a month (counted for free-tier limits, which are off by default).
- **What leaves the server:**
  - to OpenAI: the phrases the server cannot read itself, voice recordings and the text heard in them, and the
    merchant of a payment whose category is not known yet, each with the names of your categories;
  - through Telegram: the bot's messages.
- **What is not kept:** voice recordings (deleted after recognition), bank details, card numbers and passwords.

## 7. Troubleshooting

**«Не нашёл, что записать» (bot) / «Не понял, что записать» (Mini App)**
→ Write what it was and how much: «такси 18к».

**«Не расслышал»**
→ Say it again with the amount, or write it as text.

**«Не получилось разобрать — сервис распознавания сейчас не ответил»**
→ Nothing was written. Try again in a minute, or write a simpler phrase.

**The category is wrong**
→ In the bot: «Изменить» → «Категорию». In the Mini App: tap the record's category. Kapelka learns from the
correction.

**A record needs to go**
→ In the bot: «Отменить» under it, or `/undo` for your last message. In the Mini App: the record's sheet →
«Удалить операцию».

**The bot answers, but the Mini App does not open**
→ Send `/start` again. On the live instance the phone needs Tailscale switched on. More in
[live-instance.md](docs/knowledge-base/08-development/live-instance.md).

## 8. For developers

- [README.md](README.md): installation, environment and running.
- [CLAUDE.md](CLAUDE.md): commands and the current operating mode.
- [docs/knowledge-base/](docs/knowledge-base/README.md): architecture, data flow and the development guides.
