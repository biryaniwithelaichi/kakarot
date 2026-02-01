# Google Calendar Rate Limit Fix

## Problem
The app was failing with "Too many requests. Please wait." error when trying to refresh Google OAuth tokens during calendar sync. The error occurred in `CalendarService.ensureFreshToken()` and was not being handled with retry logic.

## Solution
Implemented exponential backoff retry logic with the following features:

### Changes Made

1. **Added `sleep()` helper method**
   - Provides promise-based delay for retry timing
   - Used to implement backoff delays between retries

2. **Enhanced `ensureFreshToken()` method**
   - Detects HTTP 429 (rate limit) responses
   - Implements exponential backoff: `1s * 2^attempt + random jitter (0-1s)`
   - Retries up to 3 times before giving up
   - Max backoff delay capped at 10 seconds
   - Handles both direct rate limit responses and underlying network errors
   - Logs each retry attempt for debugging

3. **Enhanced `fetchGoogleEvents()` method**
   - Applies same retry logic to Google Calendar API calls
   - Catches and retries on rate limiting errors
   - Prevents cascade failures when API is rate limited

4. **Enhanced `fetchOutlookEvents()` method**
   - Applies same retry logic to Microsoft Graph API calls
   - Consistent error handling across all calendar providers

### Retry Strategy
- **Max Retries**: 3 attempts total
- **Backoff Formula**: `min(1000 * 2^attempt + random(0-1000), 10000)` milliseconds
- **Retryable Errors**: 
  - HTTP 429 (Too Many Requests)
  - Network errors (ECONNRESET, ETIMEDOUT, ENOTFOUND)
- **Non-Retryable**: Authentication errors, invalid responses

### Logging
- Each retry attempt is logged with the backoff duration
- Error messages include attempt count and provider name
- Helps diagnose rate limiting issues in production

## Testing
A test file demonstrates the retry logic correctly handling rate limiting:
```
✅ TEST PASSED
Successfully obtained new token after rate limiting
Total attempts: 3
```

## Files Modified
- `/Users/moxo/Desktop/treeto-master/src/main/services/CalendarService.ts`

## Benefits
1. **Automatic Recovery**: App automatically retries on rate limiting instead of failing
2. **Respectful**: Exponential backoff prevents overwhelming the API
3. **Resilient**: Handles temporary network issues gracefully
4. **Observable**: Detailed logging helps troubleshoot issues
