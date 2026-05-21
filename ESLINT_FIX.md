# ESLint Auto-Fix Guide

## Quick Fix

Run this command to automatically remove all unused imports:

```bash
npm run lint -- --fix
```

This will fix 513 of the 515 errors (all unused import errors).

## Remaining Manual Fixes

After running the auto-fix, you'll need to manually fix 2 parsing errors in the test files:

### 1. src/tests/new-case-carrier-census-checklist.test.js (Line 16)
### 2. src/tests/p0-repair-2-4-carrier-analyze-workflow.test.js (Line 50)

**Error:** `Parsing error: Unexpected token <`

**Solutions:**
- Option 1: Rename `.test.js` files to `.test.jsx` if they contain JSX
- Option 2: Remove JSX code from `.js` files
- Option 3: Configure ESLint to parse JSX in `.js` files

## Steps

1. Run: `npm run lint -- --fix`
2. Check the two test files and fix the parsing errors
3. Run: `npm run lint` to verify all errors are resolved
4. Commit and push the changes
