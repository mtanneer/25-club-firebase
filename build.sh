#!/bin/bash

# Build script to inject Netlify environment variables into HTML

# Get the git repository name
REPO_NAME=$(basename -s .git "$(git config --get remote.origin.url)")

# Get the current branch name
BRANCH_NAME=${BRANCH:-$(git rev-parse --abbrev-ref HEAD)}

# Get the current commit SHA (short version)
COMMIT_SHA=$(git rev-parse --short HEAD)

echo "Injecting deployment info: $REPO_NAME / $BRANCH_NAME / $COMMIT_SHA"

# Replace placeholders in index.html
sed -i.bak "s/__REPO_NAME__/$REPO_NAME/g" index.html
sed -i.bak "s/__BRANCH_NAME__/$BRANCH_NAME/g" index.html
sed -i.bak "s/__COMMIT_SHA__/$COMMIT_SHA/g" index.html

# Clean up backup file
rm -f index.html.bak

echo "Build complete!"
