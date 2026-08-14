import { DeviceToken, type DevicePlatform } from '../models/DeviceToken';

/**
 * Upsert-by-token rather than by user+token: the same physical device token can only ever belong
 * to one account at a time (e.g. a shared/reset device logging into a different account), so
 * re-registering it under a new user should move it, not create a duplicate row that would
 * receive push notifications meant for someone else's session.
 */
export async function registerToken(
  userId: string,
  token: string,
  platform: DevicePlatform,
): Promise<void> {
  await DeviceToken.findOneAndUpdate(
    { token },
    { user: userId, token, platform },
    { upsert: true, setDefaultsOnInsert: true },
  );
}

export async function unregisterToken(token: string): Promise<void> {
  await DeviceToken.deleteOne({ token });
}

export async function getTokensForUser(userId: string): Promise<string[]> {
  const tokens = await DeviceToken.find({ user: userId }).select('token');
  return tokens.map((t) => t.token);
}
