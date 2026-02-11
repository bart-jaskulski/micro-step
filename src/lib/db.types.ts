// Message types for main thread ↔ worker communication

export type DbRequestBody =
  | { type: 'init' }
  | { type: 'exec'; sql: string; params?: any[] }
  | { type: 'query'; sql: string; params?: any[] }
  | { type: 'export' }
  | { type: 'import'; data: ArrayBuffer };

export type DbRequest = DbRequestBody & { id: number };

export type DbResponse =
  | { id: number; type: 'success'; data?: any }
  | { id: number; type: 'error'; message: string }
  | { type: 'change'; table: string };
