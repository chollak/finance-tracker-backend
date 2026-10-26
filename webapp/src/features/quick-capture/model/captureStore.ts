import { create } from 'zustand';
import type { ReviewSession } from './captureReview';

interface CaptureState {
  /** The composer's text: kept while the user goes to manual entry and back, and returned by «Изменить». */
  draft: string;
  /** The records of the phrase on the review screen; null when there is none. */
  review: ReviewSession | null;
  setDraft: (draft: string) => void;
  openReview: (session: ReviewSession) => void;
  updateReview: (update: (session: ReviewSession) => ReviewSession) => void;
  closeReview: () => void;
}

/**
 * The composer and the review of a sent phrase (FT-114) share this: Home sends the text and opens the review
 * screen with the records it made; the review returns the text to Home's field when it is cancelled. Only in
 * memory: after a reload there is no review to come back to — the records stay saved.
 */
export const useCaptureStore = create<CaptureState>()((set) => ({
  draft: '',
  review: null,
  setDraft: (draft) => set({ draft }),
  openReview: (session) => set({ review: session }),
  updateReview: (update) => set((state) => (state.review ? { review: update(state.review) } : state)),
  closeReview: () => set({ review: null }),
}));
