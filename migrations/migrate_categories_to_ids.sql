-- Migration: Convert Russian category names to English IDs
-- Run this in Supabase SQL Editor
-- Date: 2026-01-18

-- First, let's see what categories exist
-- SELECT DISTINCT category FROM transactions;

-- Migrate expense categories
UPDATE transactions SET category =
  CASE
    -- Еда и напитки
    WHEN LOWER(category) IN ('еда', 'food') THEN 'food'
    WHEN LOWER(category) IN ('продукты', 'groceries') THEN 'groceries'
    WHEN LOWER(category) IN ('рестораны', 'ресторан', 'restaurants') THEN 'restaurants'
    WHEN LOWER(category) IN ('кофе', 'coffee') THEN 'coffee'

    -- Транспорт
    WHEN LOWER(category) IN ('транспорт', 'transport') THEN 'transport'
    WHEN LOWER(category) IN ('такси', 'taxi') THEN 'taxi'
    WHEN LOWER(category) IN ('метро', 'автобус', 'public-transport') THEN 'public-transport'
    WHEN LOWER(category) IN ('бензин', 'топливо', 'заправка', 'fuel') THEN 'fuel'

    -- Жилье и коммунальные
    WHEN LOWER(category) IN ('коммунальные', 'свет', 'электричество', 'вода', 'газ', 'utilities') THEN 'utilities'
    WHEN LOWER(category) IN ('аренда', 'жилье', 'квартира', 'rent') THEN 'rent'
    WHEN LOWER(category) IN ('интернет', 'связь', 'internet') THEN 'internet'

    -- Покупки
    WHEN LOWER(category) IN ('покупки', 'шоппинг', 'shopping') THEN 'shopping'
    WHEN LOWER(category) IN ('одежда', 'clothing') THEN 'clothing'
    WHEN LOWER(category) IN ('электроника', 'техника', 'electronics') THEN 'electronics'

    -- Развлечения
    WHEN LOWER(category) IN ('развлечения', 'кино', 'entertainment') THEN 'entertainment'
    WHEN LOWER(category) IN ('хобби', 'hobbies') THEN 'hobbies'
    WHEN LOWER(category) IN ('спорт', 'sports') THEN 'sports'

    -- Здоровье
    WHEN LOWER(category) IN ('здоровье', 'врач', 'health') THEN 'health'
    WHEN LOWER(category) IN ('аптека', 'лекарства', 'pharmacy') THEN 'pharmacy'
    WHEN LOWER(category) IN ('фитнес', 'спортзал', 'fitness') THEN 'fitness'

    -- Образование
    WHEN LOWER(category) IN ('образование', 'учеба', 'education') THEN 'education'
    WHEN LOWER(category) IN ('курсы', 'courses') THEN 'courses'

    -- Прочее расходы
    WHEN LOWER(category) IN ('счета', 'платежи', 'bills') THEN 'bills'
    WHEN LOWER(category) IN ('подписки', 'subscriptions') THEN 'subscriptions'

    -- Доходы
    WHEN LOWER(category) IN ('зарплата', 'зп', 'salary') THEN 'salary'
    WHEN LOWER(category) IN ('фриланс', 'подработка', 'freelance') THEN 'freelance'
    WHEN LOWER(category) IN ('инвестиции', 'дивиденды', 'investment') THEN 'investment'
    WHEN LOWER(category) IN ('подарок', 'gift') THEN 'gift'
    WHEN LOWER(category) IN ('возврат', 'кэшбэк', 'refund') THEN 'refund'
    WHEN LOWER(category) IN ('бонус', 'премия', 'bonus') THEN 'bonus'

    -- Другое
    WHEN LOWER(category) IN ('другое', 'прочее', 'other') THEN 'other'

    -- Keep as is if already ID or unknown
    ELSE COALESCE(NULLIF(category, ''), 'other')
  END
WHERE category IS NOT NULL;

-- Verify the migration
-- SELECT DISTINCT category, COUNT(*) FROM transactions GROUP BY category ORDER BY category;
