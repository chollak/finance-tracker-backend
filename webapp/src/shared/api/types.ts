// API Response wrapper types
export interface ApiResponse<T> {
  data: T;
  error?: string;
  message?: string;
}

export interface ApiError {
  message: string;
  statusCode?: number;
  errors?: Record<string, string[]>;
  /** The reason the server gave, whichever envelope it used (see readServerError). */
  serverMessage?: string;
  code?: string;
}

// Pagination types (for future use)
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
