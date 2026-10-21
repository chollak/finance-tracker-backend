import { useState, type ReactNode } from 'react';
import { ArrowUp, Bell, Download, FileText, Mic, MicOff, Palette, PenLine, User, Wallet } from 'lucide-react';
import {
  AccountPicker,
  BackButton,
  Button,
  CalendarSheet,
  CategoryPicker,
  CategoryDot,
  CategoryTile,
  ChoiceChips,
  Keypad,
  OfflineBar,
  ProblemScreen,
  Segmented,
  SettingsRow,
  SettingsSection,
  SkeletonBlock,
  SwitchRow,
  UndoToast,
} from '@/shared/ui/pastel';
import type { PastelColor } from '@/shared/lib/pastel/categoryColors';
import {
  amountFontSize,
  emptyKeypad,
  formatMinor,
  keypadDisplay,
  keypadFromMinor,
  keypadIsPlaceholder,
  keypadToMinor,
  type Currency,
} from '@/shared/lib/money';
import { showUndoToast } from '@/shared/lib/undo';
import { relativeDayLabel, toLocalDate } from '@/shared/lib/dates';

/** Labels about 30% longer, the way Uzbek ones will be. */
const LONG: Record<string, string> = {
  'Сохранить расход': 'Сохранить этот расход сейчас',
  'Расход': 'Расход денег',
  'Доход': 'Поступление',
  'Присылать сводку': 'Присылать сводку дня каждый вечер',
  'Кафе': 'Кафе и рестораны',
  'Продукты': 'Продукты и рынок',
};

const CATEGORIES: { name: string; color: PastelColor }[] = [
  { name: 'Продукты', color: 'peach' },
  { name: 'Кафе', color: 'rose' },
  { name: 'Транспорт', color: 'sky' },
  { name: 'Дом', color: 'sand' },
  { name: 'Связь', color: 'lilac' },
  { name: 'Здоровье', color: 'mint' },
  { name: 'Покупки', color: 'butter' },
  { name: 'Другое', color: 'mist' },
];

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="type-label text-ink-muted">{title}</h2>
      {children}
    </section>
  );
}

function Panel({ theme, long }: { theme: 'light' | 'dark'; long: boolean }) {
  const t = (label: string) => (long ? LONG[label] ?? label : label);
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [summary, setSummary] = useState(true);
  const [time, setTime] = useState<'20:00' | '21:00' | '22:00' | '23:00'>('21:00');
  const [category, setCategory] = useState('Кафе');
  const [currency, setCurrency] = useState<Currency>('UZS');
  const [keypad, setKeypad] = useState(() => keypadFromMinor(14_500_000, 'UZS'));
  const minor = keypadToMinor(keypad, currency);
  const [sheet, setSheet] = useState<'category' | 'filter' | 'account' | 'date' | null>(null);
  const [accountId, setAccountId] = useState('card');
  const today = toLocalDate(new Date());
  const [date, setDate] = useState(today);
  const display = keypadDisplay(keypad);

  return (
    <div data-theme={theme} className="flex flex-1 flex-col gap-6 bg-bg p-4 text-ink">
      <p className="type-section">{theme === 'light' ? 'Светлая' : 'Тёмная'}</p>

      <Block title="Button">
        <Button>{t('Сохранить расход')}</Button>
        <Button disabled>Введите сумму</Button>
        <div className="flex items-center gap-3">
          <Button variant="round" aria-label="Голосовой ввод"><Mic strokeWidth={1.9} /></Button>
          <Button variant="round" aria-label="Отправить"><ArrowUp strokeWidth={1.9} /></Button>
          <Button variant="round-secondary" aria-label="Ручной ввод"><PenLine strokeWidth={1.9} /></Button>
          {/* «Назад» of a nested screen (on `card`); inside Telegram it gives way to Telegram's BackButton.
              Here a press does nothing: the showcase is not a nested screen and has nowhere to go back to */}
          <BackButton onClick={() => {}} />
          <Button variant="text">Отменить</Button>
        </div>
      </Block>

      <Block title="Segmented">
        <Segmented
          ariaLabel="Тип операции"
          value={kind}
          onChange={setKind}
          options={[{ value: 'expense', label: t('Расход') }, { value: 'income', label: t('Доход') }]}
        />
      </Block>

      <Block title="Keypad · Toast">
        <Segmented
          ariaLabel="Валюта"
          value={currency}
          onChange={(next) => {
            setCurrency(next);
            setKeypad(emptyKeypad());
          }}
          options={[{ value: 'UZS', label: 'Сум' }, { value: 'USD', label: 'USD' }]}
        />
        <p
          className={keypadIsPlaceholder(keypad) ? 'text-ink-muted' : 'text-ink'}
          style={{ fontSize: amountFontSize(display), fontWeight: 700, letterSpacing: '-1.8px', lineHeight: 1.1 }}
        >
          {display} <span className="text-[17px] font-bold tracking-normal text-ink-muted">{currency === 'UZS' ? 'сум' : 'USD'}</span>
        </p>
        <Keypad currency={currency} state={keypad} onChange={setKeypad} />
        <Button
          disabled={minor === null}
          onClick={() => {
            const saved = minor ?? 0;
            showUndoToast({
              kind: 'saved',
              title: 'Записано',
              detail: `${t('Кафе')} · ${formatMinor(-saved, currency)} · Карта`,
              undo: () => {
                setKeypad(keypadFromMinor(saved, currency));
                showUndoToast({ kind: 'info', title: 'Запись отменена' });
              },
            });
            setKeypad(emptyKeypad());
          }}
        >
          {minor === null ? 'Введите сумму' : t('Сохранить расход')}
        </Button>
        <Button
          variant="text"
          onClick={() => showUndoToast({ kind: 'deleted', title: 'Удалено', detail: `Кафе · ${formatMinor(-14_500_000, 'UZS')}`, undo: () => {} })}
        >
          Удалить операцию
        </Button>
      </Block>

      <Block title="Sheet · Picker · Calendar">
        <div className="flex flex-wrap gap-2">
          <Button variant="text" onClick={() => setSheet('category')}>Категория: {category}</Button>
          <Button variant="text" onClick={() => setSheet('filter')}>Фильтр</Button>
          <Button variant="text" onClick={() => setSheet('account')}>Счёт: {accountId}</Button>
          <Button variant="text" onClick={() => setSheet('date')}>Дата: {relativeDayLabel(date, today)}</Button>
        </div>
        <CategoryPicker
          open={sheet === 'category'}
          onOpenChange={(open) => setSheet(open ? 'category' : null)}
          title="Категория расхода"
          groups={[{ categories: CATEGORIES.map((c) => ({ id: c.name, name: t(c.name), color: c.color })) }]}
          selectedId={category}
          guessedId="Покупки"
          onSelect={(picked) => setCategory(picked.id)}
          context={{ text: `«Кофе» · ${formatMinor(-2_500_000, 'UZS')}`, onOpenOperation: () => setSheet(null) }}
        />
        <CategoryPicker
          open={sheet === 'filter'}
          onOpenChange={(open) => setSheet(open ? 'filter' : null)}
          title="Фильтр по категории"
          allOption={{ label: 'Все категории', selected: true, onSelect: () => {} }}
          groups={[
            { label: 'Расходы', categories: CATEGORIES.map((c) => ({ id: c.name, name: t(c.name), color: c.color })) },
            { label: 'Доходы', categories: [{ id: 'salary', name: 'Зарплата', color: 'mint' }, { id: 'gift', name: 'Подарки', color: 'rose' }] },
          ]}
          onSelect={() => {}}
        />
        <AccountPicker
          open={sheet === 'account'}
          onOpenChange={(open) => setSheet(open ? 'account' : null)}
          accounts={[
            { id: 'cash', name: 'Наличные', balance: formatMinor(125_000_000, 'UZS') },
            { id: 'card', name: 'Карта', balance: formatMinor(318_000_000, 'UZS') },
            { id: 'usd', name: 'Доллары', balance: formatMinor(42_000, 'USD') },
          ]}
          selectedId={accountId}
          onSelect={(account) => setAccountId(account.id)}
        />
        <CalendarSheet
          open={sheet === 'date'}
          onOpenChange={(open) => setSheet(open ? 'date' : null)}
          value={date}
          today={today}
          onSelect={setDate}
        />
      </Block>

      <Block title="Switch">
        <div className="flex flex-col gap-3 rounded-card bg-sheet-card px-4 py-2">
          <SwitchRow label={t('Присылать сводку')} checked={summary} onChange={setSummary} />
          {summary && (
            <ChoiceChips
              ariaLabel="Время сводки"
              value={time}
              onChange={setTime}
              options={(['20:00', '21:00', '22:00', '23:00'] as const).map((value) => ({ value, label: value }))}
              className="pb-3"
            />
          )}
          <SwitchRow label="Предупреждать" checked={false} onChange={() => {}} />
        </div>
      </Block>

      <Block title="CategoryTile · CategoryDot">
        <div role="radiogroup" aria-label="Категория" className="grid grid-cols-4 gap-2">
          {CATEGORIES.map((c) => (
            <CategoryTile
              key={c.name}
              name={t(c.name)}
              color={c.color}
              selected={category === c.name}
              guessed={c.name === 'Покупки'}
              onSelect={() => setCategory(c.name)}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => <CategoryDot key={c.name} name={c.name} color={c.color} />)}
        </div>
      </Block>

      <Block title="SettingsList">
        <SettingsSection title="Деньги">
          <SettingsRow kind="link" to="/dev/pastel" icon={<Wallet strokeWidth={1.9} />} title="Счета и курс" subtitle="3 счёта · курс ЦБ на 16 окт" />
          <SettingsRow kind="sheet" onClick={() => {}} icon={<Bell strokeWidth={1.9} />} title="Сводка дня" subtitle="Каждый вечер в 21:00" />
          <SettingsRow kind="sheet" onClick={() => {}} icon={<Palette strokeWidth={1.9} />} title="Тема" subtitle="Как в Telegram" />
        </SettingsSection>
        <SettingsSection title="Данные" note="Файл придёт в чат с ботом.">
          <SettingsRow kind="action" onClick={() => {}} icon={<Download strokeWidth={1.9} />} title="Скачать все записи" subtitle="CSV, все счета" />
          <SettingsRow kind="static" icon={<User strokeWidth={1.9} />} title="Шукур" subtitle="Вход через Telegram" />
        </SettingsSection>
      </Block>

      <Block title="Skeleton">
        <div className="flex flex-col gap-3 rounded-hero bg-primary p-5">
          <SkeletonBlock className="h-3.5 w-28 bg-on-primary/20" />
          <SkeletonBlock radius="tile" className="h-10 w-48 bg-on-primary/20" />
        </div>
        <div className="flex items-center gap-3 rounded-card bg-card px-4 py-3">
          <SkeletonBlock className="size-10" />
          <span className="flex flex-1 flex-col gap-2">
            <SkeletonBlock className="h-3 w-1/2" />
            <SkeletonBlock className="h-3 w-1/3" />
          </span>
          <SkeletonBlock className="h-3 w-16" />
        </div>
      </Block>

      <Block title="OfflineBar">
        <OfflineBar />
      </Block>

      <Block title="ProblemScreen">
        <div className="overflow-hidden rounded-card border border-line">
          <ProblemScreen
            fullScreen={false}
            header={<Button variant="text">Отмена</Button>}
            icon={<MicOff strokeWidth={1.9} />}
            title="Нет доступа к микрофону"
            text="Telegram не может слушать. Включите доступ в настройках телефона или напишите текстом."
            steps={['Откройте настройки телефона', 'Telegram → Микрофон', 'Включите доступ и вернитесь сюда']}
            action={{ label: 'Написать текстом', onClick: () => {} }}
            secondary={{ label: 'Доступ включён — попробовать снова', onClick: () => {} }}
          />
        </div>
      </Block>

      <Block title="Типографика">
        <p className="type-balance">9 743 000</p>
        <p className="type-amount-card">−145 000</p>
        <p className="type-section">Последние операции</p>
        <p className="type-body">Кофе 25к, такси 18к…</p>
        <p className="type-label text-ink-muted">Сегодня</p>
        <p className="flex items-center gap-2 type-body-strong"><FileText className="size-4" strokeWidth={1.9} /> Продукты <span className="text-income">+12 500 000</span></p>
      </Block>
    </div>
  );
}

/**
 * Showcase of «Пастель» primitives in both themes (FT-093). Not linked from the app: /dev/pastel.
 * The «+30%» switch lengthens labels the way Uzbek ones will be.
 */
export function PastelShowcasePage() {
  const [long, setLong] = useState(false);
  return (
    <main className="min-h-dvh bg-bg">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex flex-col">
          <h1 className="type-section text-ink">«Пастель» · компоненты</h1>
          <p className="type-label text-ink-muted">Шторки и уведомления — в теме страницы: смените тему системы</p>
        </div>
        <label className="flex items-center gap-2 text-[13px] font-bold text-ink">
          <input type="checkbox" checked={long} onChange={(event) => setLong(event.target.checked)} />
          +30% подписи
        </label>
      </div>
      <div className="flex flex-col md:flex-row">
        <Panel theme="light" long={long} />
        <Panel theme="dark" long={long} />
      </div>
      <UndoToast />
    </main>
  );
}
