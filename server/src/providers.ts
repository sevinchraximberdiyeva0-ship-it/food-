// Extension contracts only. No payment, GPS, or external delivery network calls.
export interface DeliveryProvider {
  quote(input: { restaurantId: number; address: string }): Promise<{ quoteId: string; amountUZS: number; expiresAt: string }>;
  createDelivery(input: { orderId: number; quoteId: string; idempotencyKey: string }): Promise<{ providerTaskId: string }>;
  cancelDelivery(providerTaskId: string): Promise<void>;
  getStatus(providerTaskId: string): Promise<string>;
  verifyWebhook(body: Buffer, signature: string): boolean;
  normalizeStatus(status: string): 'assigned' | 'picked_up' | 'delivered' | 'failed';
}
export interface PaymentProvider {
  create(input: { orderId: number; amountUZS: number; idempotencyKey: string }): Promise<{ paymentId: string }>;
  refund(paymentId: string, amountUZS: number, idempotencyKey: string): Promise<void>;
  verifyWebhook(body: Buffer, signature: string): boolean;
}
export interface LocationProvider {
  publish(input: { courierId: number; latitude: number; longitude: number; occurredAt: string }): Promise<void>;
}
