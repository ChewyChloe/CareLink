import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Resolves a supply item name to a configured commerce destination URL.
 *
 * Today: DIAPER → COMMERCE_DIAPER_URL
 * Future roadmap: SHOPLINE, 91APP, CYBERBIZ, LINE OA 開店幫手, brand partners.
 * Do NOT implement those integrations now.
 */
@Injectable()
export class CommerceLinkResolver {
  private static readonly ITEM_TO_ENV_KEY: Record<string, string> = {
    '尿布': 'COMMERCE_DIAPER_URL',
    '濕紙巾': 'COMMERCE_WIPES_URL',
    '奶粉': 'COMMERCE_FORMULA_URL',
    '換洗衣物': 'COMMERCE_CLOTHES_URL',
  };

  constructor(private readonly configService: ConfigService) {}

  /**
   * Resolves a commerce destination URL for a given item name.
   * Returns null if no URL is configured or if the URL is not HTTPS.
   */
  resolve(itemName: string): string | null {
    const envKey = CommerceLinkResolver.ITEM_TO_ENV_KEY[itemName];
    if (!envKey) return null;

    const url = this.configService.get<string>(envKey);
    if (!url || typeof url !== 'string') return null;

    const trimmed = url.trim();
    if (!trimmed) return null;

    // Only HTTPS URLs allowed
    if (!trimmed.startsWith('https://')) return null;

    return trimmed;
  }
}
