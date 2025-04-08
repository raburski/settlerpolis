#!/bin/sh
# Start the backend server
cd /app/backend && node dist/index.js &

# Start nginx
nginx -g 'daemon off;' 