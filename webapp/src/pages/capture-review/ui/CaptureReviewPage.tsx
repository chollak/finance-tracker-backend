import { CaptureReview } from '@/features/quick-capture';

/**
 * The review of the records a phrase from Home's composer made (FT-114, boards «Проверка записей»,
 * «Проверка · категория под вопросом»), at /review. A nested screen of Home: «Назад» — Telegram's BackButton
 * or its own — returns the phrase to the field; «Сохранить» shows Home with «Записано» and «Отменить».
 */
export function CaptureReviewPage() {
  return <CaptureReview />;
}
