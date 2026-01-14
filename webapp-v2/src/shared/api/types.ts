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
}

// Pagination types (for future use)
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
