import { OpenAITranscriptionService } from './infrastructure/openAITranscriptionService';
import { ProcessVoiceInputUseCase } from './application/processVoiceInput';
import { ProcessTextInputUseCase } from './application/processTextInput';
import { TransactionModule } from '../transaction/transactionModule';

export class VoiceProcessingModule {
  constructor(
    private openAIService: OpenAITranscriptionService,
    private transactionModule: TransactionModule
  ) {}

  getProcessVoiceInputUseCase(): ProcessVoiceInputUseCase {
    return new ProcessVoiceInputUseCase(
      this.openAIService,
      this.transactionModule.getCreateTransactionUseCase()
    );
  }

  getProcessTextInputUseCase(): ProcessTextInputUseCase {
    return new ProcessTextInputUseCase(
      this.openAIService,
      this.transactionModule.getCreateTransactionUseCase()
    );
  }
}
