// Environment configuration template for runtime variable injection
// This file is processed by docker-entrypoint.sh to inject environment variables
window.__ENV__ = {
  VITE_API_URL: '${VITE_API_URL}',
  VITE_APP_NAME: '${VITE_APP_NAME}',
  VITE_APP_VERSION: '${VITE_APP_VERSION}',
  NODE_ENV: '${NODE_ENV}'
};