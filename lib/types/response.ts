export interface ResponseActionSuccess<T> {
  success: true;
  data: T;
}

export interface ResponseActionError {
  success: false;
  error: string;
  /** Serializable connectivity reason (`db_unreachable` | `timeout`). Only
   * present for connection failures — generic query errors stay opaque. */
  cause?: string;
  /** Driver/prisma code when one exists (e.g. `P1001`). Plain string. */
  code?: string;
}

export type ResponseAction<T> = ResponseActionSuccess<T> | ResponseActionError;
