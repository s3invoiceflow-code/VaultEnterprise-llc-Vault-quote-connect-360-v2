#!/bin/bash
# Fix ESLint unused imports errors
echo "Running ESLint auto-fix..."
npm run lint -- --fix

echo "ESLint fixes complete!"
