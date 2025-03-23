#!/bin/bash

# Build the project
npm run build

# Create a local deployment directory
mkdir -p ./deployed

# Copy the built files to the local deployment directory
cp -r dist/* ./deployed/

# Create js directory and copy JS files
mkdir -p ./deployed/js
cp -r js/* ./deployed/js/

echo "Local deployment complete! Files are in ./deployed/"
echo "To deploy to the server, use: sudo cp -r ./deployed/* /var/www/html/tutor/"
