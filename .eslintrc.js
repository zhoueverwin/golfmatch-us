module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  rules: {
    // Basic rules for TypeScript - relaxed for development
    '@typescript-eslint/no-unused-vars': 'off', // Disabled for development
    '@typescript-eslint/no-explicit-any': 'off', // Disabled for development
    'no-console': 'off', // Disabled for development
    'no-debugger': 'error',
  },
  env: {
    es6: true,
    node: true,
  },
};
