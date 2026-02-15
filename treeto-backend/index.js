const express = require('express');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const qs = require('qs');
require('dotenv').config();

const app = express();

/**
 * 1. PAYLOAD SIZE FIX
 * Increase limit to 50MB to handle large audio chunks
 */
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const PORT = process.env.PORT || 8080;

// Security: Rate limiting
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 100, // Increased to 100 to allow for chat + embeddings traffic
  message: { error: "Too many requests. Please wait." }
});
app.use('/api/', limiter);

// --- ENDPOINTS ---

/**
 * DEEPGRAM TOKEN (Secure)
 * Generates a temporary key for the frontend to stream audio
 */
app.post('/api/deepgram/token', async (req, res) => {
  try {
    const response = await axios.post('https://api.deepgram.com/v1/auth/grant', {}, {
      headers: { 
        'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
        'Content-Type': 'application/json' 
      }
    });
    res.json(response.data);
  } catch (err) {
    console.error("Deepgram Token Error:", err.message);
    res.status(err.response?.status || 500).json({ error: 'Failed to generate token' });
  }
});

/**
 * TRANSCRIPTION PROXY
 * Handles Base64 audio from the desktop app
 */
app.post('/api/transcribe', async (req, res) => {
  try {
    let deepgramBody = req.body;
    let deepgramHeaders = {
      'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
      'Content-Type': 'application/json' 
    };

    if (req.body.audio) {
      deepgramBody = Buffer.from(req.body.audio, 'base64');
      deepgramHeaders['Content-Type'] = 'audio/wav'; 
    }

    const response = await axios.post(
      'https://api.deepgram.com/v1/listen?smart_format=true&punctuate=true&model=nova-2', 
      deepgramBody, 
      { headers: deepgramHeaders }
    );
    
    res.json(response.data);
  } catch (err) {
    console.error("Transcription Error:", err.message);
    res.status(err.response?.status || 500).json(err.response?.data || { error: "Transcription failed" });
  }
});

/**
 * SMART AI PROXY
 * Routes requests to Gemini or OpenAI based on the model name
 */
app.post('/api/chat', async (req, res) => {
  try {
    const requestedModel = req.body.model || '';
    const isGemini = requestedModel.includes('gemini');

    if (isGemini) {
      // --- ROUTE TO GEMINI ---
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || 'gemini-2.0-flash'}:generateContent?key=${process.env.GEMINI_API_KEY}`;
      const response = await axios.post(geminiUrl, req.body);
      res.json(response.data);
    } else {
      // --- ROUTE TO OPENAI ---
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        req.body,
        {
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      res.json(response.data);
    }
  } catch (err) {
    console.error("AI Error:", err.message);
    res.status(err.response?.status || 500).json(err.response?.data || { error: "AI processing failed" });
  }
});

/**
 * 🆕 EMBEDDINGS PROXY (New)
 * Proxies text to OpenAI to generate vector embeddings
 */
app.post('/api/embeddings', async (req, res) => {
  try {
    const { input, model } = req.body;

    // Call OpenAI Embeddings API
    const response = await axios.post(
      'https://api.openai.com/v1/embeddings',
      {
        input: input,
        model: model || 'text-embedding-3-small' // Default to efficient model
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.json(response.data);
  } catch (err) {
    console.error("Embeddings Error:", err.response?.data || err.message);
    res.status(err.response?.status || 500).json(err.response?.data || { error: "Embeddings generation failed" });
  }
});

// --- 🔒 OAUTH ENDPOINTS ---

/**
 * GOOGLE CALENDAR OAUTH EXCHANGE
 * ✅ FIXED: Explicitly checks for 'refresh_token' to prevent "Missing code" error
 */
app.post('/api/auth/google', async (req, res) => {
  try {
    const { code, redirect_uri, code_verifier, refresh_token } = req.body;
    
    const payload = {
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
    };

    // Logic: If we have a refresh token, ignore 'code' and do a refresh
    if (refresh_token) {
      payload.refresh_token = refresh_token;
      payload.grant_type = 'refresh_token';
    } else if (code) {
      payload.code = code;
      payload.redirect_uri = redirect_uri;
      payload.grant_type = 'authorization_code';
      payload.code_verifier = code_verifier;
    } else {
      console.error("❌ Google Auth: Missing both code and refresh_token");
      return res.status(400).json({ error: "Missing 'code' for login or 'refresh_token' for refresh." });
    }

    const response = await axios.post('https://oauth2.googleapis.com/token', qs.stringify(payload), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    res.json(response.data);

  } catch (err) {
    console.error("Google Auth Error:", err.response?.data || err.message);
    res.status(err.response?.status || 500).json(err.response?.data || { error: "Google Auth Failed" });
  }
});

/**
 * HUBSPOT OAUTH EXCHANGE
 */
app.post('/api/auth/hubspot', async (req, res) => {
  try {
    const { code, redirect_uri, grant_type, refresh_token } = req.body;
    const isRefresh = grant_type === 'refresh_token';
    const formData = qs.stringify(
      isRefresh
        ? {
            grant_type: 'refresh_token',
            client_id: process.env.HUBSPOT_CLIENT_ID,
            client_secret: process.env.HUBSPOT_CLIENT_SECRET,
            refresh_token,
          }
        : {
            grant_type: 'authorization_code',
            client_id: process.env.HUBSPOT_CLIENT_ID,
            client_secret: process.env.HUBSPOT_CLIENT_SECRET,
            redirect_uri,
            code,
          }
    );
    
    const response = await axios.post('https://api.hubapi.com/oauth/v1/token', formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    res.json(response.data);
  } catch (err) {
    console.error("HubSpot Auth Error:", err.message);
    res.status(err.response?.status || 500).json(err.response?.data || { error: "HubSpot Auth Failed" });
  }
});

/**
 * SALESFORCE OAUTH EXCHANGE
 */
app.post('/api/auth/salesforce', async (req, res) => {
  try {
    const { code, redirect_uri } = req.body;
    const tokenUrl = process.env.SALESFORCE_TOKEN_URL || 'https://login.salesforce.com/services/oauth2/token';
    
    const formData = qs.stringify({
      grant_type: 'authorization_code',
      client_id: process.env.SALESFORCE_CLIENT_ID,
      client_secret: process.env.SALESFORCE_CLIENT_SECRET,
      redirect_uri,
      code
    });

    const response = await axios.post(tokenUrl, formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    res.json(response.data);
  } catch (err) {
    console.error("Salesforce Auth Error:", err.message);
    res.status(err.response?.status || 500).json(err.response?.data || { error: "Salesforce Auth Failed" });
  }
});

/**
 * SLACK OAUTH
 */
app.post('/api/auth/slack', async (req, res) => {
  try {
    const { code, redirect_uri } = req.body;
    
    const formData = qs.stringify({
      client_id: process.env.SLACK_CLIENT_ID,
      client_secret: process.env.SLACK_CLIENT_SECRET,
      code: code,
      redirect_uri: redirect_uri
    });

    const response = await axios.post('https://slack.com/api/oauth.v2.access', formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    if (!response.data.ok) {
      throw new Error(response.data.error || 'Unknown Slack error');
    }

    res.json(response.data);
  } catch (err) {
    console.error("Slack Auth Error:", err.message);
    res.status(err.response?.status || 500).json(err.response?.data || { error: "Slack Auth Failed" });
  }
});

/**
 * CONFIGURATION
 */
app.get('/api/config', (req, res) => {
  res.json({
    status: "online",
    region: "asia-south1",
    features: { transcription: true, ai: true, secure_auth: true }
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Treeto Server live on port ${PORT}`);
});