// Telegram WebApp types
export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    query_id?: string;
    user?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
      language_code?: string;
    };
    start_param?: string;
    auth_date?: number;
    hash?: string;
  };
  version: string;
  platform: string;
  colorScheme: 'light' | 'dark';
  themeParams: ThemeParams;
  isExpanded: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  headerColor: string;
  backgroundColor: string;
  isClosingConfirmationEnabled: boolean;
  isFullscreen?: boolean;

  // Safe area insets (Bot API 8.0+)
  safeAreaInset?: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  contentSafeAreaInset?: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };

  // Methods
  ready(): void;
  expand(): void;
  close(): void;
  enableClosingConfirmation(): void;
  disableClosingConfirmation(): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  setBottomBarColor?(color: string): void;

  // Main Button
  MainButton: {
    text: string;
    color: string;
    textColor: string;
    isVisible: boolean;
    isActive: boolean;
    isProgressVisible: boolean;
    hasShineEffect?: boolean;
    setText(text: string): void;
    onClick(callback: () => void): void;
    offClick(callback: () => void): void;
    show(): void;
    hide(): void;
    enable(): void;
    disable(): void;
    showProgress(leaveActive?: boolean): void;
    hideProgress(): void;
    setParams(params: Partial<{
      text: string;
      color: string;
      text_color: string;
      is_active: boolean;
      is_visible: boolean;
      has_shine_effect: boolean;
    }>): void;
  };

  // Back Button
  BackButton: {
    isVisible: boolean;
    onClick(callback: () => void): void;
    offClick(callback: () => void): void;
    show(): void;
    hide(): void;
  };

  // Haptic Feedback
  HapticFeedback: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
    selectionChanged(): void;
  };

  // Cloud Storage
  CloudStorage: {
    setItem(
      key: string,
      value: string,
      callback?: (error: Error | null, success?: boolean) => void
    ): void;
    getItem(
      key: string,
      callback: (error: Error | null, value?: string) => void
    ): void;
    getItems(
      keys: string[],
      callback: (error: Error | null, values?: Record<string, string>) => void
    ): void;
    removeItem(
      key: string,
      callback?: (error: Error | null, success?: boolean) => void
    ): void;
    removeItems(
      keys: string[],
      callback?: (error: Error | null, success?: boolean) => void
    ): void;
    getKeys(
      callback: (error: Error | null, keys?: string[]) => void
    ): void;
  };

  // Popup and alerts
  showPopup(
    params: {
      title?: string;
      message: string;
      buttons?: Array<{
        id?: string;
        type?: 'default' | 'ok' | 'close' | 'cancel' | 'destructive';
        text: string;
      }>;
    },
    callback?: (buttonId: string) => void
  ): void;
  showConfirm(message: string, callback?: (confirmed: boolean) => void): void;
  showAlert(message: string, callback?: () => void): void;

  // Links
  openLink(url: string, options?: { try_instant_view?: boolean }): void;
  openTelegramLink(url: string): void;

  // Data
  sendData(data: string): void;

  // Events
  onEvent(eventType: string, callback: (data?: any) => void): void;
  offEvent(eventType: string, callback: (data?: any) => void): void;

  // Fullscreen (Bot API 8.0+)
  requestFullscreen?(): void;
  exitFullscreen?(): void;
}

export interface ThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
  header_bg_color?: string;
  accent_text_color?: string;
  section_bg_color?: string;
  section_header_text_color?: string;
  subtitle_text_color?: string;
  destructive_text_color?: string;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp;
    };
  }
}

export {};
