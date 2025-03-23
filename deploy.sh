#!/bin/bash

# Build the project
npm run build

# Copy the built files to the server directory
cp -r dist/* /var/www/html/tutor/

echo "Deployment complete!"
