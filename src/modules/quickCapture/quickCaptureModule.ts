import { VoiceProcessingModule } from '../voiceProcessing/voiceProcessingModule';
import { QuickCaptureService } from './application/quickCaptureService';

export class QuickCaptureModule {
  constructor(private quickCaptureService: QuickCaptureService) {}

  /**
   * Quick capture reuses the existing text pipeline rather than owning a parser of its own,
   * so every client goes through the same conservative semantic safeguards.
   */
  static create(voiceModule: VoiceProcessingModule): QuickCaptureModule {
    return new QuickCaptureModule(
      new QuickCaptureService(voiceModule.getProcessTextInputUseCase())
    );
  }

  getQuickCaptureService(): QuickCaptureService {
    return this.quickCaptureService;
  }
}
