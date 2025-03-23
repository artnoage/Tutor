#!/bin/bash

# Build the project
npm run build

# Copy the built files to the server directory
cp -r dist/* /var/www/html/tutor/

# Copy the JS files to ensure they're available
mkdir -p /var/www/html/tutor/js
cp -r js/* /var/www/html/tutor/js/

echo "Deployment complete!"
