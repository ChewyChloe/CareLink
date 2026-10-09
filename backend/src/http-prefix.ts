// Keep bootstrap and HTTP integration tests on the same route configuration.
export const HTTP_PREFIX_OPTIONS = { exclude: ['health', 'api/health', 'webhooks/(.*)', 'api/webhooks/(.*)'] };
