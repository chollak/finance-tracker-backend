import {
  REMINDER_RULES,
  goalAlertLevel,
  isAuditCallDue,
  isGoalAlertTime,
  isSubscriptionReminderTime,
} from '../src/modules/notification/domain/reminders';
import {
  AUDIT_LATER_PATTERN,
  SUBSCRIPTION_ANSWER_PATTERN,
  formatAuditCall,
  formatReminder,
  formatSubscriptionAnswer,
} from '../src/delivery/messaging/telegram/formatters/reminderMessage';

const NB = ' ';
const GOAL_ID = '3f1c2a4b-5d6e-4f70-8a9b-0c1d2e3f4a5b';
const APP = 'https://miniapp.test/audit?userId=597843119';

/**
 * FT-133 (BotNotice.md, board «Бот · напоминания»): when a goal, a subscription and the audit are told, and the words
 * the bot uses — the board's copy where the board shows the message.
 */
describe('reminder rules (FT-133)', () => {
  it('a goal is told at 80% of its limit and when the limit is exceeded', () => {
    expect(REMINDER_RULES.goalNearShare).toBe(0.8);
    expect(goalAlertLevel(8_160_000, 10_200_000)).toBe('near');
    expect(goalAlertLevel(8_400_000, 10_200_000)).toBe('near');
    expect(goalAlertLevel(8_159_900, 10_200_000)).toBeNull();
    // Exactly the limit is not over it: «осталось 0 сум»
    expect(goalAlertLevel(10_200_000, 10_200_000)).toBe('near');
    expect(goalAlertLevel(10_200_100, 10_200_000)).toBe('over');
    // No limit (a goal of a few сум rounds to 0): nothing to tell
    expect(goalAlertLevel(100, 0)).toBeNull();
  });

  it('goal alerts come in the daytime on the user\'s clock; a subscription from the morning until the day ends', () => {
    expect(isGoalAlertTime('09:59')).toBe(false);
    expect(isGoalAlertTime('10:00')).toBe(true);
    expect(isGoalAlertTime('12:30')).toBe(true);
    expect(isGoalAlertTime('21:59')).toBe(true);
    expect(isGoalAlertTime('22:00')).toBe(false);
    expect(isSubscriptionReminderTime('09:59')).toBe(false);
    expect(isSubscriptionReminderTime('10:00')).toBe(true);
    expect(isSubscriptionReminderTime('23:30')).toBe(true);
  });

  it('the audit is called on the 1st, from the chosen time until the day ends', () => {
    expect(isAuditCallDue({ date: '2026-11-01', time: '09:59' }, '10:00')).toBe(false);
    expect(isAuditCallDue({ date: '2026-11-01', time: '10:00' }, '10:00')).toBe(true);
    expect(isAuditCallDue({ date: '2026-11-01', time: '23:59' }, '10:00')).toBe(true);
    expect(isAuditCallDue({ date: '2026-11-02', time: '10:00' }, '10:00')).toBe(false);
    expect(isAuditCallDue({ date: '2026-11-01', time: '12:00' }, '19:00')).toBe(false);
  });
});

describe('reminder messages (FT-133)', () => {
  it('a goal at 80%: the board\'s message with «Открыть цели ↗»', () => {
    const notice = formatReminder(
      { kind: 'goal_near', today: '2026-10-27', goal: { id: GOAL_ID, name: 'Такси', spentMinor: 8_400_000, limitMinor: 10_200_000, endsOn: '2026-10-31' } },
      { appUrl: APP }
    );
    expect(notice.text).toBe([
      `<b>Цель «Такси»: 84${NB}000 из 102${NB}000${NB}сум</b>`,
      `До конца октября по лимиту осталось 18${NB}000${NB}сум.`,
      '',
      '<i>Напишу ещё раз, только если лимит будет превышен.</i>',
    ].join('\n'));
    expect(notice.keyboard).toEqual([[expect.objectContaining({ text: 'Открыть цели ↗', web_app: { url: APP } })]]);
  });

  it('a goal over its limit: by how much, and that the bot is silent about it until the month ends', () => {
    const notice = formatReminder(
      { kind: 'goal_over', today: '2026-10-29', goal: { id: GOAL_ID, name: 'Такси <домой>', spentMinor: 11_000_000, limitMinor: 10_200_000, endsOn: '2026-10-31' } },
      { appUrl: APP }
    );
    expect(notice.text).toBe([
      `<b>Цель «Такси &lt;домой&gt;»: 110${NB}000 из 102${NB}000${NB}сум</b>`,
      `Лимит до конца октября превышен на 8${NB}000${NB}сум.`,
      '',
      '<i>Больше об этой цели в октябре не напишу.</i>',
    ].join('\n'));
    expect(notice.keyboard).toEqual([[expect.objectContaining({ text: 'Открыть цели ↗' })]]);
  });

  it('a subscription the day before its charge: the absolute date, «Отменено | Оставить» in one row', () => {
    const notice = formatReminder(
      { kind: 'subscription', today: '2026-11-02', goal: { id: GOAL_ID, name: 'Кинопоиск', serviceKind: 'subscription', chargeOn: '2026-11-03', chargeMinor: 5_000_000 } },
      { appUrl: APP }
    );
    expect(notice.text).toBe([
      `<b>3${NB}ноября Кинопоиск спишет 50${NB}000${NB}сум</b>`,
      'В ревизии вы решили отменить подписку. Отменить можно только в самом сервисе.',
    ].join('\n'));
    expect(notice.keyboard).toEqual([[
      expect.objectContaining({ text: 'Отменено', callback_data: `n:sub:ok:${GOAL_ID}` }),
      expect.objectContaining({ text: 'Оставить', callback_data: `n:sub:keep:${GOAL_ID}` }),
    ]]);
    expect(SUBSCRIPTION_ANSWER_PATTERN.exec(`n:sub:keep:${GOAL_ID}`)?.slice(1)).toEqual(['keep', GOAL_ID]);
    expect(Buffer.byteLength(`n:sub:keep:${GOAL_ID}`)).toBeLessThanOrEqual(64);
  });

  it('an operator\'s paid tariff is switched off, not cancelled (FT-142 serviceKind)', () => {
    const notice = formatReminder(
      { kind: 'subscription', today: '2026-11-02', goal: { id: GOAL_ID, name: 'Второй номер', serviceKind: 'tariff', chargeOn: '2026-11-03', chargeMinor: 5_000_000 } },
      { appUrl: APP }
    );
    expect(notice.text).toBe([
      `<b>3${NB}ноября Второй номер спишет 50${NB}000${NB}сум</b>`,
      'В ревизии вы решили отключить платный тариф. Отключить можно только у оператора.',
    ].join('\n'));
    expect(notice.keyboard[0].map(button => button.text)).toEqual(['Отключено', 'Оставить']);
  });

  it('the answers replace the question, without buttons', () => {
    expect(formatSubscriptionAnswer({ name: 'Кинопоиск', serviceKind: 'subscription', monthlyMinor: 5_000_000 }, 'cancelled')).toEqual({
      text: `<b>Кинопоиск: подписка отменена</b>\nМинус 50${NB}000${NB}сум в месяц. Цель из ревизии выполнена.`,
      keyboard: [],
    });
    expect(formatSubscriptionAnswer({ name: 'Кинопоиск', serviceKind: 'subscription', monthlyMinor: 5_000_000 }, 'keep')).toEqual({
      text: '<b>Кинопоиск остаётся</b>\nЦель «отменить» снята. Подписка снова попадёт в ревизию, только если подорожает.',
      keyboard: [],
    });
    expect(formatSubscriptionAnswer({ name: 'Второй номер', serviceKind: 'tariff', monthlyMinor: 5_000_000 }, 'cancelled').text).toBe(
      `<b>Второй номер: тариф отключён</b>\nМинус 50${NB}000${NB}сум в месяц. Цель из ревизии выполнена.`
    );
    expect(formatSubscriptionAnswer({ name: 'Второй номер', serviceKind: 'tariff', monthlyMinor: 5_000_000 }, 'keep').text).toBe(
      '<b>Второй номер остаётся</b>\nЦель «отключить» снята. Тариф снова попадёт в ревизию, только если подорожает.'
    );
  });

  it('the audit is ready: how many spendings wait, «Открыть ревизию ↗» and «Позже» on rows of their own', () => {
    const notice = formatReminder({ kind: 'audit', month: '2026-10', left: 5, repeat: false }, { appUrl: APP });
    expect(notice.text).toBe('<b>Ревизия октября готова</b>\n5 трат на проверку — пара минут.');
    expect(notice.keyboard).toEqual([
      [expect.objectContaining({ text: 'Открыть ревизию ↗', web_app: { url: APP } })],
      [expect.objectContaining({ text: 'Позже', callback_data: 'n:later:2026-10:5' })],
    ]);
    expect(AUDIT_LATER_PATTERN.exec('n:later:2026-10:5')?.slice(1)).toEqual(['2026-10', '5']);
    expect(formatReminder({ kind: 'audit', month: '2026-10', left: 1, repeat: false }, { appUrl: APP }).text).toContain('1 трата на проверку');
    expect(formatReminder({ kind: 'audit', month: '2026-12', left: 3, repeat: false }, { appUrl: APP }).text).toBe(
      '<b>Ревизия декабря готова</b>\n3 траты на проверку — пара минут.'
    );
  });

  it('«Позже» pressed: when the bot calls again, once, and «Позже» is gone', () => {
    expect(formatAuditCall({ month: '2026-10', left: 5 }, { later: { on: '2026-11-02', time: '10:00' }, appUrl: APP, today: '2026-11-01' })).toEqual({
      text: `<b>Ревизия октября готова</b>\n5 трат на проверку — пара минут.\n\n<i>Напомню 2${NB}ноября в 10:00, один раз.</i>`,
      keyboard: [[expect.objectContaining({ text: 'Открыть ревизию ↗' })]],
    });
  });

  it('the second call has no «Позже» and says the bot will not call again', () => {
    const notice = formatReminder({ kind: 'audit', month: '2026-10', left: 3, repeat: true }, { appUrl: APP });
    expect(notice.text).toBe('<b>Ревизия октября готова</b>\n3 траты на проверку — пара минут.\n\n<i>Больше не напомню — ревизия ждёт на главной.</i>');
    expect(notice.keyboard).toEqual([[expect.objectContaining({ text: 'Открыть ревизию ↗' })]]);
  });

  it('without a Mini App address the links are left out, the answers stay', () => {
    expect(formatReminder({ kind: 'audit', month: '2026-10', left: 5, repeat: false }, {}).keyboard).toEqual([
      [expect.objectContaining({ text: 'Позже' })],
    ]);
    expect(
      formatReminder({ kind: 'goal_near', today: '2026-10-27', goal: { id: GOAL_ID, name: 'Такси', spentMinor: 8_400_000, limitMinor: 10_200_000, endsOn: '2026-10-31' } }, {}).keyboard
    ).toEqual([]);
  });
});
