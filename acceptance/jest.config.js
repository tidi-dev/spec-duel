const group = (name) => ({
  displayName: name,
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: __dirname,
  testMatch: [`<rootDir>/src/${name}/**/*.spec.ts`],
});

module.exports = {
  maxWorkers: 1,
  testTimeout: 60000,
  projects: [group('baseline'), group('change-1'), group('change-2'), group('change-3')],
};
