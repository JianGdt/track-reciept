export class ServiceError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public retryAfter?: number,
    public rate?: { limit: number; remaining: number; reset: number },
    public providerStatus?: number,
  ) {
    super(message);
  }
}
