import antfu from '@antfu/eslint-config'

export default antfu({
  node: true,
  ignores: ['node_modules', '*.md', 'docs/**'],
  rules: {
    'no-console': 'off',
    'no-new': 'off',
    'regexp/no-unused-capturing-group': 'off',
  },
})
