-- Migration: Convert budget category_ids from Russian names to English IDs
-- Date: 2025-01-18
-- Context: After migrating transactions.category to English IDs,
--          budgets.category_ids also need migration for budget matching to work.
--
-- Problem:
--   Budget.categoryIds = ["Еда","Кофе"]
--   Transaction.category = "food"
--   Result: ["Еда","Кофе"].includes("food") → FALSE → spent = 0
--
-- Solution: Convert budget category_ids to English IDs

UPDATE budgets
SET category_ids = (
  SELECT jsonb_agg(
    CASE
      -- Expense categories
      WHEN value::text = '"Еда"' OR value::text = '"еда"' THEN '"food"'
      WHEN value::text = '"Продукты"' OR value::text = '"продукты"' THEN '"groceries"'
      WHEN value::text = '"Рестораны"' OR value::text = '"рестораны"' THEN '"restaurants"'
      WHEN value::text = '"Кофе"' OR value::text = '"кофе"' THEN '"coffee"'
      WHEN value::text = '"Транспорт"' OR value::text = '"транспорт"' THEN '"transport"'
      WHEN value::text = '"Такси"' OR value::text = '"такси"' THEN '"taxi"'
      WHEN value::text = '"Общ. транспорт"' THEN '"public-transport"'
      WHEN value::text = '"Топливо"' OR value::text = '"топливо"' OR value::text = '"Бензин"' THEN '"fuel"'
      WHEN value::text = '"Коммунальные"' OR value::text = '"коммунальные"' THEN '"utilities"'
      WHEN value::text = '"Аренда"' OR value::text = '"аренда"' THEN '"rent"'
      WHEN value::text = '"Интернет"' OR value::text = '"интернет"' THEN '"internet"'
      WHEN value::text = '"Покупки"' OR value::text = '"покупки"' THEN '"shopping"'
      WHEN value::text = '"Одежда"' OR value::text = '"одежда"' THEN '"clothing"'
      WHEN value::text = '"Электроника"' OR value::text = '"электроника"' THEN '"electronics"'
      WHEN value::text = '"Развлечения"' OR value::text = '"развлечения"' THEN '"entertainment"'
      WHEN value::text = '"Хобби"' OR value::text = '"хобби"' THEN '"hobbies"'
      WHEN value::text = '"Спорт"' OR value::text = '"спорт"' THEN '"sports"'
      WHEN value::text = '"Здоровье"' OR value::text = '"здоровье"' THEN '"health"'
      WHEN value::text = '"Аптека"' OR value::text = '"аптека"' THEN '"pharmacy"'
      WHEN value::text = '"Фитнес"' OR value::text = '"фитнес"' THEN '"fitness"'
      WHEN value::text = '"Образование"' OR value::text = '"образование"' THEN '"education"'
      WHEN value::text = '"Курсы"' OR value::text = '"курсы"' THEN '"courses"'
      WHEN value::text = '"Счета"' OR value::text = '"счета"' THEN '"bills"'
      WHEN value::text = '"Подписки"' OR value::text = '"подписки"' THEN '"subscriptions"'
      WHEN value::text = '"Подарки"' OR value::text = '"подарки"' THEN '"gifts-expense"'
      WHEN value::text = '"Другое"' OR value::text = '"другое"' THEN '"other"'
      -- Income categories
      WHEN value::text = '"Зарплата"' OR value::text = '"зарплата"' THEN '"salary"'
      WHEN value::text = '"Фриланс"' OR value::text = '"фриланс"' THEN '"freelance"'
      WHEN value::text = '"Инвестиции"' OR value::text = '"инвестиции"' THEN '"investment"'
      WHEN value::text = '"Подарок"' OR value::text = '"подарок"' THEN '"gift"'
      WHEN value::text = '"Возврат"' OR value::text = '"возврат"' THEN '"refund"'
      WHEN value::text = '"Бонус"' OR value::text = '"бонус"' THEN '"bonus"'
      WHEN value::text = '"Перевод"' OR value::text = '"перевод"' THEN '"transfer"'
      -- Keep as-is if already English ID or unknown
      ELSE value::text
    END::jsonb
  )
  FROM jsonb_array_elements(category_ids::jsonb)
)
WHERE category_ids IS NOT NULL;

-- Verify migration
SELECT id, name, category_ids FROM budgets ORDER BY name;
