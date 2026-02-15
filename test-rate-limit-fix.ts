/**
 * Test to verify exponential backoff retry logic for rate limiting
 * This simulates the behavior of the fixed ensureFreshToken method
 */

// Simulate the sleep function
async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Simulate fetch with rate limiting
let attemptCount = 0;
async function mockFetch(url: string, options: any): Promise<Response> {
  attemptCount++;
  console.log(`[Attempt ${attemptCount}] Fetching ${url}`);
  
  // First two attempts return 429, third attempt succeeds
  if (attemptCount <= 2) {
    console.log(`  → Rate limited (429)`);
    return {
      ok: false,
      status: 429,
      text: async () => '{"error": "Too many requests. Please wait."}',
      json: async () => ({})
    } as Response;
  }
  
  console.log(`  → Success (200)`);
  return {
    ok: true,
    status: 200,
    json: async () => ({
      access_token: 'new_token',
      expires_in: 3600
    })
  } as Response;
}

// Simulated ensureFreshToken with exponential backoff
async function ensureFreshToken(provider: string, tokens: any): Promise<any> {
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`\n🔄 Token refresh attempt ${attempt + 1}/${maxRetries}`);
      
      const response = await mockFetch('https://backend.example.com/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: tokens.refreshToken,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        
        if (response.status === 429 && attempt < maxRetries - 1) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 1000, 10000);
          console.log(`⏳ Rate limited. Waiting ${Math.round(backoffMs)}ms before retry...`);
          await sleep(backoffMs);
          continue;
        }
        
        throw new Error(`Refresh token failed: ${errorText}`);
      }

      const data = await response.json();
      console.log(`✅ Token refreshed successfully`);
      return {
        ...tokens,
        accessToken: data.access_token,
        expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : tokens.expiresAt,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      const errorMessage = lastError.message;
      const isRetryable = errorMessage.includes('Too many requests') || 
                         errorMessage.includes('429');
      
      if (isRetryable && attempt < maxRetries - 1) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 1000, 10000);
        console.log(`⚠️  Retryable error. Waiting ${Math.round(backoffMs)}ms...`);
        await sleep(backoffMs);
        continue;
      }
      
      throw lastError;
    }
  }

  throw lastError || new Error(`Failed to refresh token after ${maxRetries} attempts`);
}

// Run test
async function runTest() {
  console.log('='.repeat(60));
  console.log('Testing Exponential Backoff Rate Limit Handling');
  console.log('='.repeat(60));
  
  try {
    const result = await ensureFreshToken('google', {
      refreshToken: 'old_refresh_token',
      expiresAt: Date.now() - 1000 // Expired
    });
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ TEST PASSED');
    console.log('='.repeat(60));
    console.log(`Successfully obtained new token after rate limiting`);
    console.log(`Total attempts: ${attemptCount}`);
  } catch (error) {
    console.log('\n' + '='.repeat(60));
    console.log('❌ TEST FAILED');
    console.log('='.repeat(60));
    console.log(`Error: ${error instanceof Error ? error.message : error}`);
  }
}

runTest();
