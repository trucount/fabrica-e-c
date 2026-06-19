export const APP_NAME = 'FABRICA E-COMMERCE';
export const BRIDGE_ORIGIN = 'https://sparrow-supabase-connect.lovable.app';
export const BRIDGE_API_KEY = 'sparrowaisolutions';
export const STORE_REPO = 'https://github.com/trucount/fabrica-final-e-c.git';
export const POLL_INTERVAL_MS = 2500;
export const POLL_TIMEOUT_MS = 10 * 60 * 1000;

export const REQUIRED_ENV_KEYS = [
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'OPENROUTER_API_KEY',
  'UMAMI_WEBSITE_ID',
  'UMAMI_API_KEY',
  'SHIPPO_API_KEY'
];

export const HARDCODED_ENV = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: '0000',
  UMAMI_API_CLIENT_ENDPOINT: 'https://api.umami.is/v1',
  SUPABASE_SERVICE_ROLE_KEY: '0000'
};
