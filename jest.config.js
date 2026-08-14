/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup/jest.setup.ts'],
  clearMocks: true,
  collectCoverageFrom: ['src/**/*.ts'],
  // swc (not ts-jest) transforms both our .ts sources and the handful of ESM-only node_modules
  // packages in otplib's dependency chain (@scure/*, @noble/*) that Jest's default CJS-only
  // module loader can't parse otherwise. Type checking already happens separately via `tsc
  // --noEmit`, so a non-typechecking transpiler here is fine and much faster than ts-jest.
  transform: {
    '^.+\\.(t|j)sx?$': ['@swc/jest'],
  },
  // htmlparser2 (a sanitize-html dependency) and its own dependency chain ship ESM-only.
  transformIgnorePatterns: [
    'node_modules/(?!(@scure|@noble|otplib|@otplib|htmlparser2|domelementtype|domhandler|domutils|entities|dom-serializer)/)',
  ],
};
