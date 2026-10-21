import { Transaction } from '../../transaction/domain/transactionEntity';
import { countsAs, uzsMinorOf } from '../../transaction/domain/periodTotals';
import { recordDay, shiftMonth } from '../../transaction/domain/monthAnalytics';
import { SubscriptionService, findSubscription, noteWords } from './subscriptionCatalog';
import { capitalized, dayText, inMonth, monthOf, ratioText, sumText, timesText } from './auditText';

/**
 * The spending audit's rules (FT-130, design-system «Ревизия трат», board «Ревизия трат»): which spending of a month
 * may be unnecessary, by which of four rules, and why — a statement with numbers, no questions. Only flexible
 * categories; one spending under different notes is one group in both months. Amounts are сум minor units.
 *
 * The thresholds are those of the board (`candidates()` in design/prototype/Pastel_Audit.dc.html), in one constant so
 * the rule is changed in one place and its test says what it is.
 */
export const AUDIT_RULES = {
  /** Кафе, Транспорт, Покупки, Связь, Другое — by starter key, so a renamed category stays flexible. */
  flexiblePresetKeys: ['cafe', 'transport', 'shopping', 'telecom', 'other'],
  /** «Часто и понемногу»: from 8 times in the month, on average up to 60 000 сум. */
  frequentSmall: { minCount: 8, maxAverageMinor: 6_000_000 },
  /** «Стало чаще»: at least twice as often as the month before, from 300 000 сум in the month. */
  moreOften: { minRatio: 2, minAmountMinor: 30_000_000 },
  /** «Крупная покупка»: one purchase from 600 000 сум, among purchases and other spending. */
  largePurchase: { minAmountMinor: 60_000_000, presetKeys: ['shopping', 'other'] },
  /** A subscription's month that differs by more than this share from the month before «подорожала» / «подешевела». */
  subscriptionPriceChange: 0.1,
  /** Averages are told rounded to a thousand сум, without «≈». */
  averageRoundingMinor: 100_000,
  /**
   * A month counts as recorded whole when recording began on one of its first 3 days. One begun on the 25th is known
   * only in part: «таких трат не было» or «вчетверо чаще» about it would not be true, so it is not compared.
   */
  wholeMonthStartDays: 3,
} as const;

/** A real expense as the audit reads it (`auditRecordsOf`). */
export interface AuditRecord {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** сум minor units; dollars converted at the rate. */
  amountMinor: number;
  categoryId: string;
  /** The category's current name. */
  categoryName: string;
  /** The starter key of the category; null for one of the user's own. */
  categoryPresetKey: string | null;
  /** The note as written: the description, else the merchant; may be empty. */
  note: string;
}

export type AuditCandidateKind = 'subscription' | 'tariff' | 'frequent_small' | 'more_often' | 'large_purchase';

/** The first line of a candidate's card: «Часто и понемногу · Кафе». */
export const AUDIT_KIND_LABELS: Record<AuditCandidateKind, string> = {
  subscription: 'Подписка',
  tariff: 'Платный тариф',
  frequent_small: 'Часто и понемногу',
  more_often: 'Стало чаще',
  large_purchase: 'Крупная покупка',
};

export interface AuditOperation {
  id: string;
  date: string;
  amountMinor: number;
}

export interface AuditCandidate {
  /**
   * The spending's group within this audit: `service:<key>` for a service of the catalog, else
   * `<categoryId>|<note key>`. Only a service's key holds from month to month: a note group's root depends on the notes
   * of the two months compared (September with only «Такси домой» gives `…|такси домой`, October with a plain «Такси»
   * gives `…|такси`). A decision of another audit (FT-131) is matched by `isSameAuditSpending`.
   */
  key: string;
  kind: AuditCandidateKind;
  /** «Подписка», «Часто и понемногу»… */
  kindLabel: string;
  /** The category of the spending (of its latest charge, for a service). */
  categoryId: string;
  categoryName: string;
  /** The spending as the person wrote it, with a capital letter: «Такси», «Кинопоиск»; the category's name without a note. */
  name: string;
  /** The group's key among the notes of its category (`spendingNoteKey`); null for a service of the catalog. */
  noteKey: string | null;
  serviceKey: string | null;
  /** «Такси — 13 раз»; a subscription and a purchase — just the name. */
  title: string;
  /** What it took in the month: the group's total; a large purchase — the purchase alone. */
  amountMinor: number;
  /** Operations behind `amountMinor`. */
  count: number;
  /** It repeats, so a goal may limit it: everything but a large purchase. */
  recurring: boolean;
  /**
   * What a month of it costs if it goes on: `amountMinor` when recurring, 0 for a one-off purchase; a service charged
   * earlier but not the month before (yearly, paused) — the charge spread over the months since its last one.
   */
  monthlyMinor: number;
  /** The operations of the month in the group, newest first. */
  operations: AuditOperation[];
  /**
   * The same spending the month before (a service's charges in any category); null when that month is not compared:
   * not recorded whole (`firstWholeMonth`).
   */
  previous: { count: number; amountMinor: number } | null;
  /** A statement with numbers: «В августе — 2 раза на 352 000 сум: вдвое чаще и на 380 000 сум больше.» */
  reason: string;
}

/**
 * A note as the audit compares it: lower case, «е» for «ё», punctuation as spaces; a note that only repeats the
 * category's name counts as no note.
 */
export function spendingNoteKey(note: string, categoryName: string): string {
  const key = noteWords(note);
  return key === noteWords(categoryName) ? '' : key;
}

/** «Такси домой» and «Такси в аэропорт» are «Такси»: the note is the group's or begins with its words. */
export function isSameSpending(noteKey: string, groupKey: string): boolean {
  return noteKey === groupKey || (groupKey !== '' && noteKey.startsWith(`${groupKey} `));
}

/**
 * Whether candidates of two audits are about the same spending — how a decision is found again in the next audit
 * (FT-131), since a note group's `key` may change between audits: a service by its key, whatever the category of its
 * charge; else the same category and one group's note within the other's, either way («Такси домой» of September is
 * «Такси» of October).
 */
export function isSameAuditSpending(
  a: Pick<AuditCandidate, 'categoryId' | 'noteKey' | 'serviceKey'>,
  b: Pick<AuditCandidate, 'categoryId' | 'noteKey' | 'serviceKey'>
): boolean {
  if (a.serviceKey !== null || b.serviceKey !== null) return a.serviceKey === b.serviceKey;
  if (a.categoryId !== b.categoryId || a.noteKey === null || b.noteKey === null) return false;
  return isSameSpending(a.noteKey, b.noteKey) || isSameSpending(b.noteKey, a.noteKey);
}

/**
 * The first month recorded from its start, so the audit may compare with it: the month of the first record when that
 * record is on one of its first `wholeMonthStartDays` days, else the next month; null before any record. The audit of a
 * month before it has «мало данных» (FT-132).
 */
export function firstWholeMonth(firstRecordDate: string | null): string | null {
  if (!firstRecordDate) return null;
  const month = firstRecordDate.slice(0, 7);
  return Number(firstRecordDate.slice(8, 10)) <= AUDIT_RULES.wholeMonthStartDays ? month : shiftMonth(month, 1);
}

/**
 * The real expenses of `records` as the audit reads them: not income, not own money moving, not debts, not a record
 * awaiting review (FT-103 totals); dollars at the rate and left out without one, as in every total. The category's
 * starter key comes from `categories`; a category not among them reads as one of the user's own.
 */
export function auditRecordsOf(
  records: readonly Transaction[],
  options: { categories: ReadonlyArray<{ id: string; name: string; presetKey: string | null }>; usdRateMinor: number | null }
): AuditRecord[] {
  const categories = new Map(options.categories.map(category => [category.id, category]));
  const out: AuditRecord[] = [];
  for (const record of records) {
    if (countsAs(record) !== 'expense' || !record.categoryId) continue;
    const amountMinor = uzsMinorOf(record, options.usdRateMinor);
    if (amountMinor === null) continue;
    const category = categories.get(record.categoryId);
    out.push({
      id: record.id ?? '',
      date: recordDay(record),
      amountMinor,
      categoryId: record.categoryId,
      categoryName: category?.name ?? record.category,
      categoryPresetKey: category?.presetKey ?? null,
      note: (record.description || record.merchant || '').trim(),
    });
  }
  return out;
}

interface Group {
  key: string;
  service: SubscriptionService | null;
  /** The note key of the group; '' for a service. */
  noteKey: string;
  current: AuditRecord[];
  previous: AuditRecord[];
}

const total = (records: readonly AuditRecord[]) => records.reduce((sum, record) => sum + record.amountMinor, 0);
const newestFirst = (a: AuditRecord, b: AuditRecord) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id);
const isFlexible = (record: AuditRecord) =>
  record.categoryPresetKey !== null && (AUDIT_RULES.flexiblePresetKeys as readonly string[]).includes(record.categoryPresetKey);
const isPurchase = (record: AuditRecord) =>
  record.categoryPresetKey !== null && (AUDIT_RULES.largePurchase.presetKeys as readonly string[]).includes(record.categoryPresetKey);

/**
 * The groups of spending in both months: a service of the catalog by its key, whatever the note; any other note by
 * its category and the shortest note of that category, in either month, it begins with. A service's earlier charges
 * are read apart, in every category (`MonthContext.serviceCharges`).
 */
function groupsOf(current: AuditRecord[], previous: AuditRecord[]): Group[] {
  const noteKeys = new Map<AuditRecord, string>();
  const keysByCategory = new Map<string, Set<string>>();
  const services = new Map<AuditRecord, SubscriptionService>();
  for (const record of [...current, ...previous]) {
    const service = findSubscription(record.note);
    if (service) {
      services.set(record, service);
      continue;
    }
    const key = spendingNoteKey(record.note, record.categoryName);
    noteKeys.set(record, key);
    const keys = keysByCategory.get(record.categoryId) ?? new Set<string>();
    keys.add(key);
    keysByCategory.set(record.categoryId, keys);
  }

  const rootOf = (record: AuditRecord): string => {
    const key = noteKeys.get(record)!;
    let root = key;
    for (const candidate of keysByCategory.get(record.categoryId)!) {
      if (candidate.length < root.length && isSameSpending(key, candidate)) root = candidate;
    }
    return root;
  };

  const groups = new Map<string, Group>();
  const add = (record: AuditRecord, month: 'current' | 'previous') => {
    const service = services.get(record) ?? null;
    const noteKey = service ? '' : rootOf(record);
    const key = service ? `service:${service.key}` : `${record.categoryId}|${noteKey}`;
    const group = groups.get(key) ?? { key, service, noteKey, current: [], previous: [] };
    group[month].push(record);
    groups.set(key, group);
  };
  current.forEach(record => add(record, 'current'));
  previous.filter(record => !services.has(record)).forEach(record => add(record, 'previous'));
  return [...groups.values()];
}

/** The group's name: a service's own; else its note as last written, with a capital letter; without a note — the category's. */
function nameOf(group: Group, latest: AuditRecord): string {
  if (group.service) return group.service.name;
  if (group.noteKey === '') return latest.categoryName;
  const written = [...group.current, ...group.previous]
    .filter(record => spendingNoteKey(record.note, record.categoryName) === group.noteKey)
    .sort(newestFirst)[0];
  return capitalized(written.note.trim().replace(/\s+/g, ' '));
}

interface MonthContext {
  month: string;
  previousMonth: string;
  /** The month before is recorded whole, so «не было» is true. */
  previousCompared: boolean;
  /** The largest purchase of the month: «Самая крупная покупка сентября». */
  largestPurchaseMinor: number;
  /** Each service's charges before the month, in any category: a yearly or paused one is not «новая». */
  serviceCharges: Map<string, AuditRecord[]>;
}

const monthOfRecord = (record: AuditRecord) => record.date.slice(0, 7);

/** Whole months from one month to another: 12 from 2025-09 to 2026-09. */
const monthsBetween = (from: string, to: string) =>
  (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7));

/**
 * «Новая подписка: первое списание 3 сентября.», «Подорожала: …», «Списывается каждый месяц: …»; just the charge when
 * the month before is not compared, or when it had no charge but an earlier month did (a yearly or paused one).
 */
function subscriptionReason(service: SubscriptionService, now: AuditRecord[], earlier: AuditRecord[], before: AuditRecord[], context: MonthContext): string {
  const amount = total(now);
  const tariff = service.kind === 'tariff';
  if (!context.previousCompared || (before.length === 0 && earlier.length > 0)) {
    if (now.length === 1) return `Списание ${dayText(now[0].date)} — ${sumText(amount)}.`;
    return `${capitalized(inMonth(context.month))} — ${timesText(now.length)} на ${sumText(amount)}.`;
  }
  if (before.length === 0) {
    const first = [...now].sort((a, b) => a.date.localeCompare(b.date))[0];
    return `${tariff ? 'Новый тариф' : 'Новая подписка'}: первое списание ${dayText(first.date)}.`;
  }
  const was = total(before);
  const both = `${inMonth(context.previousMonth)} — ${sumText(was)}, ${inMonth(context.month)} — ${sumText(amount)}`;
  if (Math.abs(amount - was) > was * AUDIT_RULES.subscriptionPriceChange) {
    const word = amount > was ? (tariff ? 'Подорожал' : 'Подорожала') : (tariff ? 'Подешевел' : 'Подешевела');
    return `${word}: ${both}.`;
  }
  if (amount === was) return `Списывается каждый месяц: ${inMonth(context.previousMonth)} и ${inMonth(context.month)} по ${sumText(amount)}.`;
  return `Списывается каждый месяц: ${both}.`;
}

/** The candidate a group makes, by the first rule it meets, or null. */
function candidateOf(group: Group, context: MonthContext): AuditCandidate | null {
  const now = [...group.current].sort(newestFirst);
  const earlier = group.service ? context.serviceCharges.get(group.service.key) ?? [] : [];
  const previousOfGroup = group.service ? earlier.filter(record => monthOfRecord(record) === context.previousMonth) : group.previous;
  const before = context.previousCompared ? previousOfGroup : [];
  const amount = total(now);
  const count = now.length;
  const was = total(before);
  const latest = now[0];
  const name = nameOf(group, latest);
  const previous = context.previousCompared ? { count: before.length, amountMinor: was } : null;
  const operations = (records: AuditRecord[]) => records.map(record => ({ id: record.id, date: record.date, amountMinor: record.amountMinor }));
  const make = (kind: AuditCandidateKind, fields: Pick<AuditCandidate, 'title' | 'reason'> & Partial<AuditCandidate>): AuditCandidate => ({
    key: group.key,
    kind,
    kindLabel: AUDIT_KIND_LABELS[kind],
    categoryId: latest.categoryId,
    categoryName: latest.categoryName,
    name,
    noteKey: group.service ? null : group.noteKey,
    serviceKey: group.service?.key ?? null,
    amountMinor: amount,
    count,
    recurring: true,
    monthlyMinor: amount,
    operations: operations(now),
    previous,
    ...fields,
  });
  const inPrevious = capitalized(inMonth(context.previousMonth));

  if (group.service) {
    // Charged before but not the month before (a yearly one): a month of it is the charge over the months since then
    const lastCharge = context.previousCompared && before.length === 0 && earlier.length > 0
      ? earlier.reduce((lastDate, record) => (record.date > lastDate ? record.date : lastDate), earlier[0].date)
      : null;
    const monthlyMinor = lastCharge ? Math.round(amount / monthsBetween(lastCharge.slice(0, 7), context.month)) : amount;
    return make(group.service.kind, { title: name, reason: subscriptionReason(group.service, now, earlier, before, context), monthlyMinor });
  }

  const { frequentSmall, moreOften, largePurchase } = AUDIT_RULES;
  if (count >= frequentSmall.minCount && amount <= frequentSmall.maxAverageMinor * count) {
    const rounding = AUDIT_RULES.averageRoundingMinor;
    const average = Math.round(amount / count / rounding) * rounding;
    let reason = `В среднем ${sumText(average)} за раз.`;
    if (context.previousCompared) {
      reason += before.length > 0 ? ` ${inPrevious} — ${timesText(before.length)} на ${sumText(was)}.` : ` ${inPrevious} таких трат не было.`;
    }
    return make('frequent_small', { title: `${name} — ${timesText(count)}`, reason });
  }

  if (before.length > 0 && count >= before.length * moreOften.minRatio && amount >= moreOften.minAmountMinor && amount > was) {
    return make('more_often', {
      title: `${name} — ${timesText(count)}`,
      reason: `${inPrevious} — ${timesText(before.length)} на ${sumText(was)}: ${ratioText(count / before.length)} чаще и на ${sumText(amount - was)} больше.`,
    });
  }

  const purchase = isPurchase(latest) ? now.reduce((max, record) => (record.amountMinor > max.amountMinor ? record : max), now[0]) : null;
  if (purchase && purchase.amountMinor >= largePurchase.minAmountMinor) {
    const largest = purchase.amountMinor >= context.largestPurchaseMinor;
    return make('large_purchase', {
      title: name,
      reason: `${largest ? `Самая крупная покупка ${monthOf(context.month)}` : 'Крупная покупка'}, ${dayText(purchase.date)}.`,
      amountMinor: purchase.amountMinor,
      count: 1,
      recurring: false,
      monthlyMinor: 0,
      operations: operations([purchase]),
    });
  }
  return null;
}

/**
 * The candidates of the audit of `month` (YYYY-MM): spending of flexible categories in that month, each by the first
 * of the rules it meets — «Подписка» / «Платный тариф» (a service of the catalog charged in the month), «Часто и
 * понемногу», «Стало чаще», «Крупная покупка» — largest first. Zero and negative amounts are no spending.
 *
 * `records` should hold every month up to `month`: the month and the one before are compared, and the earlier ones
 * tell a new subscription from a yearly or paused one (a service's charges are read in any category). The month
 * before is compared only when it was recorded whole — from `firstWholeMonth(firstRecordDate)`, the day of the
 * user's first record — so nothing is said about a month recorded in part or not at all: no «Стало чаще», no «таких
 * трат не было», no «Новая подписка». Whether `month` itself was recorded whole is the caller's «мало данных».
 */
export function findAuditCandidates(input: { month: string; records: readonly AuditRecord[]; firstRecordDate: string | null }): AuditCandidate[] {
  const { month } = input;
  const previousMonth = shiftMonth(month, -1);
  const spent = input.records.filter(record => record.amountMinor > 0);
  const flexible = spent.filter(isFlexible);
  const current = flexible.filter(record => monthOfRecord(record) === month);
  const previous = flexible.filter(record => monthOfRecord(record) === previousMonth);
  const wholeFrom = firstWholeMonth(input.firstRecordDate);
  const serviceCharges = new Map<string, AuditRecord[]>();
  for (const record of spent) {
    if (monthOfRecord(record) >= month) continue;
    const service = findSubscription(record.note);
    if (service) serviceCharges.set(service.key, [...(serviceCharges.get(service.key) ?? []), record]);
  }
  const context: MonthContext = {
    month,
    previousMonth,
    previousCompared: wholeFrom !== null && previousMonth >= wholeFrom,
    largestPurchaseMinor: current.filter(isPurchase).reduce((max, record) => Math.max(max, record.amountMinor), 0),
    serviceCharges,
  };

  return groupsOf(current, previous)
    .filter(group => group.current.length > 0)
    .map(group => candidateOf(group, context))
    .filter((candidate): candidate is AuditCandidate => candidate !== null)
    .sort((a, b) => b.amountMinor - a.amountMinor || a.name.localeCompare(b.name, 'ru'));
}
