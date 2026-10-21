import { SUBSCRIPTION_CATALOG, findSubscription } from '../src/modules/audit/domain/subscriptionCatalog';

/** FT-130: the catalog of paid services the audit knows by a record's note — a constant in code, not a table. */
describe('subscription catalog (FT-130)', () => {
  it('covers streaming, music, cloud, AI services and Telegram Premium, plus paid mobile tariffs', () => {
    const groups = new Set(SUBSCRIPTION_CATALOG.map(service => service.group));
    expect([...groups].sort()).toEqual(['ai', 'cloud', 'music', 'streaming', 'tariff', 'telegram']);
    expect(SUBSCRIPTION_CATALOG.filter(service => service.group === 'telegram').map(service => service.name)).toEqual(['Telegram Premium']);
    // A tariff is «Платный тариф», everything else «Подписка»
    for (const service of SUBSCRIPTION_CATALOG) {
      expect(service.kind).toBe(service.group === 'tariff' ? 'tariff' : 'subscription');
    }
  });

  it('has unique keys and words, written as they are compared: lower case, «е» for «ё», single spaces', () => {
    const keys = SUBSCRIPTION_CATALOG.map(service => service.key);
    expect(new Set(keys).size).toBe(keys.length);
    const words = SUBSCRIPTION_CATALOG.flatMap(service => service.words);
    expect(new Set(words).size).toBe(words.length);
    for (const word of words) {
      expect(word).toBe(word.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim());
    }
  });

  it.each([
    ['Кинопоиск', 'kinopoisk', 'Кинопоиск'],
    ['подписка КиноПоиск', 'kinopoisk', 'Кинопоиск'],
    ['Netflix', 'netflix', 'Netflix'],
    ['YouTube Premium', 'youtube-premium', 'YouTube Premium'],
    ['Spotify', 'spotify', 'Spotify'],
    ['Яндекс Музыка', 'yandex-music', 'Яндекс Музыка'],
    ['яндекс плюс', 'yandex-plus', 'Яндекс Плюс'],
    ['iCloud+', 'icloud', 'iCloud'],
    ['Google One 2 ТБ', 'google-one', 'Google One'],
    ['ChatGPT Plus', 'chatgpt', 'ChatGPT'],
    ['Claude Pro', 'claude', 'Claude'],
    ['Telegram Premium', 'telegram-premium', 'Telegram Premium'],
    ['телеграм премиум на год', 'telegram-premium', 'Telegram Premium'],
    ['Второй номер', 'second-number', 'Второй номер'],
    ['Disney+', 'disney-plus', 'Disney+'],
    ['Disney Plus на год', 'disney-plus', 'Disney+'],
    ['дисней плюс', 'disney-plus', 'Disney+'],
    ['Apple TV+', 'apple-tv', 'Apple TV+'],
    ['Yandex+', 'yandex-plus', 'Яндекс Плюс'],
  ])('knows «%s»', (note, key, name) => {
    expect(findSubscription(note)).toMatchObject({ key, name });
  });

  it.each([
    'Такси', 'Кофе', 'Мобильная связь', 'Домашний интернет', 'Премиум бензин', 'Кино', 'Музыкальная школа', 'Облако-сервис ремонт', 'Telegram',
    // Merchandise and devices named after a service are purchases, not subscriptions
    'Игрушка Disney для сына', 'Рюкзак Дисней', 'Apple TV 4K', 'Кофе+круассан',
  ])(
    'leaves «%s» alone',
    note => {
      expect(findSubscription(note)).toBeNull();
    }
  );

  it('matches whole words only', () => {
    expect(findSubscription('Spotifyx')).toBeNull();
    expect(findSubscription('супер-кинопоиск')).toMatchObject({ key: 'kinopoisk' });
  });

  it('reads «+» as the word «plus»: «Disney+» is «disney plus», «iCloud+» is still iCloud', () => {
    expect(findSubscription('iCloud+')).toMatchObject({ key: 'icloud' });
    expect(findSubscription('disney +')).toMatchObject({ key: 'disney-plus' });
    expect(findSubscription('Disney')).toBeNull();
  });
});
