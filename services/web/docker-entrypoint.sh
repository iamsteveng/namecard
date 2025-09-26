#!/bin/sh
set -e

# Environment variable injection for runtime configuration
echo "Injecting environment variables into React app..."

# Default values
VITE_API_URL=${VITE_API_URL:-"http://localhost:3001"}
VITE_APP_NAME=${VITE_APP_NAME:-"NameCard Scanner"}
VITE_APP_VERSION=${VITE_APP_VERSION:-"1.0.0"}
NODE_ENV=${NODE_ENV:-"production"}

# Process environment template and create runtime config
envsubst '$VITE_API_URL $VITE_APP_NAME $VITE_APP_VERSION $NODE_ENV' < /usr/share/nginx/html/env-template.js > /usr/share/nginx/html/env-config.js

# Remove template file
rm -f /usr/share/nginx/html/env-template.js

# Inject env-config.js into index.html before other scripts
if [ -f /usr/share/nginx/html/index.html ]; then
    sed -i 's|<head>|<head>\n  <script src="/env-config.js"></script>|' /usr/share/nginx/html/index.html
fi

echo "Environment variables injected successfully"
echo "VITE_API_URL: $VITE_API_URL"
echo "NODE_ENV: $NODE_ENV"

# Start Nginx
echo "Starting Nginx..."
exec nginx -g 'daemon off;'