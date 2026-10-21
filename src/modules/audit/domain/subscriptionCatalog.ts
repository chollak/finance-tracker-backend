/**
 * The paid services the spending audit knows by a record's note (FT-130, design-system «Ревизия трат»): a constant
 * in code, not a table (docs/pastel/money-model.md). A charge of one of them in a flexible category is a «Подписка»
 * or a «Платный тариф» candidate — new, more expensive or charged every month.
 *
 * Words are written as notes are compared (`noteWords`): lower case, «е» for «ё», punctuation as spaces; «+» reads
 * as the word «plus», so «Disney+» is «disney plus». A word matches only whole words of a note: «Netflix» and
 * «подписка netflix», not «netflixx». Generic words («кино», «музыка», «облако», «premium», «telegram») are left out
 * on purpose — they name too much else; so are the bare names of brands that also sell things («Disney», «Apple TV»):
 * «Игрушка Disney» and «Apple TV 4K» are purchases, so the service needs its «plus».
 */
export type SubscriptionGroup = 'streaming' | 'music' | 'cloud' | 'ai' | 'telegram' | 'tariff';

export interface SubscriptionService {
  /** Stable id of the service: what an audit keeps when the note is written differently next month. */
  key: string;
  /** The service as the audit names it: «Кинопоиск», «Telegram Premium». */
  name: string;
  group: SubscriptionGroup;
  /** «Подписка» or «Платный тариф» (a mobile operator's extra charge). */
  kind: 'subscription' | 'tariff';
  /** What a note says to mean it. */
  words: readonly string[];
}

const subscription = (key: string, name: string, group: Exclude<SubscriptionGroup, 'tariff'>, words: string[]): SubscriptionService =>
  ({ key, name, group, kind: 'subscription', words });

export const SUBSCRIPTION_CATALOG: readonly SubscriptionService[] = [
  // Стриминг
  subscription('kinopoisk', 'Кинопоиск', 'streaming', ['кинопоиск', 'kinopoisk']),
  subscription('netflix', 'Netflix', 'streaming', ['netflix', 'нетфликс']),
  subscription('youtube-premium', 'YouTube Premium', 'streaming', ['youtube premium', 'ютуб премиум']),
  subscription('ivi', 'Иви', 'streaming', ['ivi', 'иви']),
  subscription('okko', 'Okko', 'streaming', ['okko', 'окко']),
  subscription('megogo', 'Megogo', 'streaming', ['megogo', 'мегого']),
  subscription('wink', 'Wink', 'streaming', ['wink', 'винк']),
  subscription('amediateka', 'Амедиатека', 'streaming', ['amediateka', 'амедиатека']),
  subscription('disney-plus', 'Disney+', 'streaming', ['disney plus', 'дисней плюс', 'дисней plus']),
  subscription('apple-tv', 'Apple TV+', 'streaming', ['apple tv plus', 'эпл тв плюс']),
  subscription('allplay', 'Allplay', 'streaming', ['allplay']),
  // Музыка
  subscription('spotify', 'Spotify', 'music', ['spotify', 'спотифай']),
  subscription('yandex-music', 'Яндекс Музыка', 'music', ['яндекс музыка', 'yandex music']),
  subscription('yandex-plus', 'Яндекс Плюс', 'music', ['яндекс плюс', 'yandex plus']),
  subscription('apple-music', 'Apple Music', 'music', ['apple music']),
  subscription('youtube-music', 'YouTube Music', 'music', ['youtube music', 'ютуб музыка']),
  subscription('vk-music', 'VK Музыка', 'music', ['vk музыка', 'вк музыка', 'vk music']),
  subscription('deezer', 'Deezer', 'music', ['deezer']),
  // Облако
  subscription('icloud', 'iCloud', 'cloud', ['icloud', 'айклауд']),
  subscription('google-one', 'Google One', 'cloud', ['google one', 'гугл ван']),
  subscription('yandex-disk', 'Яндекс Диск', 'cloud', ['яндекс диск', 'yandex disk', 'yandex 360', 'яндекс 360']),
  subscription('dropbox', 'Dropbox', 'cloud', ['dropbox']),
  subscription('onedrive', 'OneDrive', 'cloud', ['onedrive', 'microsoft 365']),
  // ИИ-сервисы
  subscription('chatgpt', 'ChatGPT', 'ai', ['chatgpt', 'chat gpt', 'чатгпт', 'чат гпт', 'openai']),
  subscription('claude', 'Claude', 'ai', ['claude']),
  subscription('gemini', 'Gemini', 'ai', ['gemini']),
  subscription('midjourney', 'Midjourney', 'ai', ['midjourney', 'миджорни']),
  subscription('perplexity', 'Perplexity', 'ai', ['perplexity']),
  subscription('github-copilot', 'GitHub Copilot', 'ai', ['copilot']),
  // Telegram
  subscription('telegram-premium', 'Telegram Premium', 'telegram', ['telegram premium', 'телеграм премиум', 'телеграмм премиум', 'tg premium', 'тг премиум']),
  // Платный тариф оператора
  { key: 'second-number', name: 'Второй номер', group: 'tariff', kind: 'tariff', words: ['второй номер', 'дополнительный номер'] },
];

/** A note as the catalog compares it: lower case, «е» for «ё», anything but letters and digits as one space. */
export function noteWords(note: string): string {
  return note.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** The service a note names, or null. «+» is the word «plus» here: «Disney+», «Apple TV+», «Yandex+». */
export function findSubscription(note: string): SubscriptionService | null {
  const padded = ` ${noteWords(note.replace(/\+/g, ' plus '))} `;
  if (padded.trim() === '') return null;
  return SUBSCRIPTION_CATALOG.find(service => service.words.some(word => padded.includes(` ${word} `))) ?? null;
}
