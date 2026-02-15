import { createLogger } from '../core/logger';
import { BACKEND_BASE_URL } from '../providers/BackendAPIProvider';

const logger = createLogger('SlackService');

export interface SlackToken {
  accessToken: string;
  userId: string;
  teamId: string;
  connectedAt: number;
}

export interface SlackChannel {
  id: string;
  name: string;
  isPrivate: boolean;
}

export class SlackService {
  private clientId: string;
  private redirectUri: string;

  constructor(
    // Hardcode Client ID here (Safe for Desktop Apps)
    clientId: string = '10413163008435',
    redirectUri: string = 'http://localhost:3000/oauth/slack'
  ) {
    this.clientId = clientId;
    this.redirectUri = redirectUri;
  }

  /**
   * 1. Get Authorization URL
   */
  public getAuthorizationUrl(): string {
    const scopes = ['chat:write', 'channels:read', 'users:read'];
    const params = new URLSearchParams({
      client_id: this.clientId,
      scope: scopes.join(' '), // Slack uses space separation
      redirect_uri: this.redirectUri,
      response_type: 'code'
    });

    return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
  }

  /**
   * 2. Exchange Code for Token (via Backend)
   */
  public async exchangeCodeForToken(code: string): Promise<SlackToken> {
    try {
      const response = await fetch(`${BACKEND_BASE_URL}/api/auth/slack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, redirect_uri: this.redirectUri }),
      });

      if (!response.ok) throw new Error('Backend exchange failed');

      const data = await response.json();
      
      // Slack V2 response structure
      return {
        accessToken: data.authed_user.access_token, // User token
        userId: data.authed_user.id,
        teamId: data.team.id,
        connectedAt: Date.now(),
      };
    } catch (error) {
      logger.error('Slack login failed', { error });
      throw error;
    }
  }

  /**
   * 3. Get List of Channels (Public & Private)
   */
  public async getChannels(accessToken: string): Promise<SlackChannel[]> {
    try {
      // Fetch public channels
      const response = await fetch('https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=100', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      
      const data = await response.json();
      if (!data.ok) throw new Error(data.error);

      return data.channels.map((c: any) => ({
        id: c.id,
        name: c.name,
        isPrivate: c.is_private
      }));
    } catch (error) {
      logger.error('Failed to fetch Slack channels', { error });
      return [];
    }
  }

  /**
   * 4. Send Note to Slack
   */
  public async sendNote(accessToken: string, channelId: string, noteText: string): Promise<void> {
    try {
      const response = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          channel: channelId,
          text: noteText, // Fallback text
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*New Note from Treeto* 🌳\n\n${noteText}`
              }
            }
          ]
        })
      });

      const data = await response.json();
      if (!data.ok) throw new Error(data.error);
      
      logger.info('Note sent to Slack successfully');
    } catch (error) {
      logger.error('Failed to send Slack note', { error });
      throw error;
    }
  }
}