export interface ResponseActionSuccess<T> {
  success: true;
  data: T;
}

export interface ResponseActionError {
  success: false;
  error: string;
}

export type ResponseAction<T> = ResponseActionSuccess<T> | ResponseActionError;
