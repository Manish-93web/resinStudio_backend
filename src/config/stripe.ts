import Stripe from 'stripe';
import { env } from './env';

export const isStripeConfigured = Boolean(env.STRIPE_SECRET_KEY);

export const stripe = isStripeConfigured ? new Stripe(env.STRIPE_SECRET_KEY) : null;
