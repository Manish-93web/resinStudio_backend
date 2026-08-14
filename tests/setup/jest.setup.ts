// Shared Jest setup. Individual integration test suites that need a real database start their
// own mongodb-memory-server instance (see tests/integration/setup.ts) rather than a global one,
// so unit tests that don't touch Mongo stay fast and isolated.
jest.setTimeout(20_000);
