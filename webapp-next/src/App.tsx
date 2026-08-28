/**
 * Каркас. Экраны появятся в задачах 7–9 плана фазы 2.
 *
 * Здесь намеренно нет роутера: экранов три, а Telegram даёт собственную кнопку
 * «назад» (BackButton), которой всё равно управлять руками. Роутер добавится,
 * когда появится боль от его отсутствия, а не заранее.
 */
export function App() {
  return (
    <div className="flex min-h-full flex-col gap-5 p-4 pt-14">
      <div className="rounded-[var(--radius-card)] bg-surface p-5">
        <div className="text-[13.5px] text-muted">Потрачено в августе</div>
        <div className="num mt-1 text-[40px] font-extrabold tracking-[-0.03em] leading-[1.05]">
          54 124 654
        </div>
      </div>

      <div className="rounded-[var(--radius-group)] bg-surface px-4 py-3 text-[13.5px] text-muted">
        Каркас на месте. Экраны — задачи 7–9.
      </div>
    </div>
  );
}
