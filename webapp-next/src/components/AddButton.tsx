import { hapticImpact } from '../lib/haptic';

export function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Добавить трату"
      onClick={() => {
        hapticImpact('medium');
        onClick();
      }}
      // 58px — заметно больше минимальных 44: это единственное действие экрана.
      className="fixed bottom-[30px] right-[22px] flex size-[58px] items-center justify-center rounded-full bg-text text-bg active:scale-95"
    >
      <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </button>
  );
}
