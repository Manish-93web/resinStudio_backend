import { algoliasearch, type Algoliasearch } from 'algoliasearch';
import { env } from './env';

export const isAlgoliaConfigured = Boolean(env.ALGOLIA_APP_ID && env.ALGOLIA_API_KEY);

export const algoliaClient: Algoliasearch | null = isAlgoliaConfigured
  ? algoliasearch(env.ALGOLIA_APP_ID, env.ALGOLIA_API_KEY)
  : null;

export const algoliaProductsIndexName = env.ALGOLIA_INDEX_NAME || 'products';
