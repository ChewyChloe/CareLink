import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { GeminiCareExtractionProvider } from './provider/gemini-care-extraction.provider';
import { MockCareExtractionProvider } from './provider/mock-care-extraction.provider';

@Module({
  imports: [ConfigModule],
  controllers: [AiController],
  providers: [AiService, GeminiCareExtractionProvider, MockCareExtractionProvider],
  exports: [AiService, GeminiCareExtractionProvider, MockCareExtractionProvider],
})
export class AiModule {}
