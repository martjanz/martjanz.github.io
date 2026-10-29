export const repo = (over = {}) => ({
  name: 'demo', fork: false, archived: false, has_pages: false, homepage: null,
  description: 'A demo', html_url: 'https://github.com/martjanz/demo', language: 'Python',
  stargazers_count: 0, pushed_at: '2025-01-01T00:00:00Z', topics: [], ...over,
});
