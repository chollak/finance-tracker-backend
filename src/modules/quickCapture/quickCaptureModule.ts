import { VoiceProcessingModule } from '../voiceProcessing/voiceProcessingModule';
import { QuickCaptureService } from './application/quickCaptureService';
import { CaptureReplay } from './domain/quickCaptureTypes';

export class QuickCaptureModule {
  constructor(private quickCaptureService: QuickCaptureService) {}

  /**
   * Quick capture reuses the existing text pipeline rather than owning a parser of its own,
   * so every client goes through the same conservative semantic safeguards. A payment from Apple Pay is
   * written by the same records, without the parser (FT-176).
   */
  static create(voiceModule: VoiceProcessingModule, replay?: CaptureReplay): QuickCaptureModule {
    return new QuickCaptureModule(
      new QuickCaptureService(voiceModule.getProcessTextInputUseCase(), replay, undefined, voiceModule.getRecordPaymentUseCase())
    );
  }

  getQuickCaptureService(): QuickCaptureService {
    return this.quickCaptureService;
  }
}
