import { OTP } from 'otplib';
import QRCode from 'qrcode';

const ISSUER = 'Resin by Richa';
const totp = new OTP({ strategy: 'totp' });

export function generateTwoFactorSecret(): string {
  return totp.generateSecret();
}

export async function generateTwoFactorQrCode(email: string, secret: string): Promise<string> {
  const otpauthUrl = totp.generateURI({ issuer: ISSUER, label: email, secret });
  return QRCode.toDataURL(otpauthUrl);
}

export async function verifyTwoFactorToken(token: string, secret: string): Promise<boolean> {
  try {
    // epochTolerance: [1, 1] accepts the previous/next 30s window too, so a code entered right
    // at a period boundary (or with a few seconds of clock drift) isn't rejected.
    const result = await totp.verify({ secret, token, epochTolerance: [1, 1] });
    return result.valid;
  } catch {
    return false;
  }
}
