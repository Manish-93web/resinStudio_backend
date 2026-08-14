import { randomBytes } from 'crypto';

export function generateOrderNumber(): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = randomBytes(3).toString('hex').toUpperCase();
  return `RS-${datePart}-${randomPart}`;
}
