import { Types } from 'mongoose';
import { ActivityLog } from '../models/ActivityLog';
import { logger } from '../config/logger';

interface LogActivityInput {
  actor: string;
  action: string;
  targetType?: string;
  targetId?: string | Types.ObjectId;
  metadata?: Record<string, unknown>;
}

/** Fire-and-forget by design: an activity-log write failing should never fail the request that
 *  triggered it (e.g. an admin updating an order) — log the error and move on. */
export async function logActivity(input: LogActivityInput): Promise<void> {
  try {
    await ActivityLog.create(input);
  } catch (err) {
    logger.error({ err, input }, 'Failed to write activity log entry');
  }
}
