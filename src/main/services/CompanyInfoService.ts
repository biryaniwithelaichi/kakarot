import { createLogger } from '../core/logger';
import type { CompanyInfo } from '@shared/types';
import axios from 'axios';

const logger = createLogger('CompanyInfoService');

// Common personal email domains to exclude
const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'icloud.com',
  'aol.com',
  'protonmail.com',
  'mail.com',
  'zoho.com',
  'yandex.com',
  'gmx.com',
  'fastmail.com',
]);

export class CompanyInfoService {
  private cache: Map<string, { data: CompanyInfo; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Fetch company info from email address
   * Extracts domain and fetches website metadata
   */
  async fetchCompanyInfo(email: string): Promise<CompanyInfo | null> {
    if (!email || !email.includes('@')) {
      return null;
    }

    const domain = this.extractDomain(email);
    if (!domain) {
      return null;
    }

    // Check if it's a personal email domain
    if (PERSONAL_EMAIL_DOMAINS.has(domain.toLowerCase())) {
      logger.debug('Skipping personal email domain', { domain });
      return null;
    }

    // Check cache
    const cached = this.cache.get(domain);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      logger.debug('Returning cached company info', { domain });
      return cached.data;
    }

    try {
      const companyInfo = await this.fetchWebsiteMetadata(domain);

      if (companyInfo) {
        // Cache the result
        this.cache.set(domain, { data: companyInfo, timestamp: Date.now() });
      }

      return companyInfo;
    } catch (error) {
      logger.error('Failed to fetch company info', { error, domain });
      return null;
    }
  }

  /**
   * Extract domain from email address
   */
  private extractDomain(email: string): string | null {
    const parts = email.split('@');
    if (parts.length !== 2) {
      return null;
    }
    return parts[1].toLowerCase();
  }

  /**
   * Fetch website metadata from domain
   */
  private async fetchWebsiteMetadata(domain: string): Promise<CompanyInfo | null> {
    const website = `https://${domain}`;

    try {
      // Fetch the homepage with a timeout
      const response = await axios.get(website, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Treeto/1.0; +https://treeto.io)',
          'Accept': 'text/html,application/xhtml+xml',
        },
        maxRedirects: 3,
        validateStatus: (status) => status < 400,
      });

      const html = response.data;

      // Extract metadata from HTML
      const name = this.extractCompanyName(html, domain);
      const description = this.extractDescription(html);

      return {
        domain,
        name,
        description,
        website,
        fetchedAt: Date.now(),
      };
    } catch (error) {
      // Try www subdomain if main domain fails
      if (!domain.startsWith('www.')) {
        try {
          const wwwWebsite = `https://www.${domain}`;
          const response = await axios.get(wwwWebsite, {
            timeout: 10000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; Treeto/1.0; +https://treeto.io)',
              'Accept': 'text/html,application/xhtml+xml',
            },
            maxRedirects: 3,
            validateStatus: (status) => status < 400,
          });

          const html = response.data;
          const name = this.extractCompanyName(html, domain);
          const description = this.extractDescription(html);

          return {
            domain,
            name,
            description,
            website: wwwWebsite,
            fetchedAt: Date.now(),
          };
        } catch {
          // Both attempts failed
          logger.debug('Could not fetch website', { domain });
        }
      }

      return null;
    }
  }

  /**
   * Extract company name from HTML
   */
  private extractCompanyName(html: string, domain: string): string | undefined {
    // Try to extract from <title> tag
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      let title = titleMatch[1].trim();
      // Clean up common suffixes
      title = title
        .replace(/\s*[-|–—]\s*.*(Home|Homepage|Official|Welcome).*$/i, '')
        .replace(/\s*[-|–—]\s*$/i, '')
        .trim();

      if (title && title.length > 1 && title.length < 100) {
        return title;
      }
    }

    // Try og:site_name meta tag
    const ogSiteNameMatch = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i);
    if (ogSiteNameMatch) {
      return ogSiteNameMatch[1].trim();
    }

    // Fallback: capitalize domain name
    const domainName = domain.split('.')[0];
    return domainName.charAt(0).toUpperCase() + domainName.slice(1);
  }

  /**
   * Extract description from HTML
   */
  private extractDescription(html: string): string | undefined {
    // Try meta description
    const metaDescMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
    if (metaDescMatch) {
      const desc = metaDescMatch[1].trim();
      if (desc && desc.length > 10 && desc.length < 500) {
        return desc;
      }
    }

    // Try og:description
    const ogDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
    if (ogDescMatch) {
      const desc = ogDescMatch[1].trim();
      if (desc && desc.length > 10 && desc.length < 500) {
        return desc;
      }
    }

    return undefined;
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
    logger.debug('Company info cache cleared');
  }
}
