import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { AiService } from './ai.service';

export class ExtractTestDto {
  text: string;
  childAlias?: string;
  forceProvider?: 'gemini' | 'mock';
}

@Controller(['ai', 'api/ai'])
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get('status')
  @HttpCode(HttpStatus.OK)
  getStatus() {
    return this.aiService.getGeminiStatus();
  }

  @Post('extract-test')
  @HttpCode(HttpStatus.OK)
  async testExtract(@Body() body: ExtractTestDto) {
    if (!body?.text || typeof body.text !== 'string' || !body.text.trim()) {
      throw new BadRequestException('text is required for extraction test');
    }

    const authorizedChildren = body.childAlias
      ? [{ id: '00000000-0000-0000-0000-000000000001', displayAlias: body.childAlias }]
      : undefined;

    const result = await this.aiService.extractCareEvents({
      text: body.text,
      authorizedChildren,
      forceProvider: body.forceProvider,
    });

    return {
      status: 'ok',
      modelId: result.modelId,
      promptVersion: result.promptVersion,
      schemaVersion: result.schemaVersion,
      latencyMs: result.latencyMs,
      availableTokens: result.availableTokens,
      output: result.output,
    };
  }
}
