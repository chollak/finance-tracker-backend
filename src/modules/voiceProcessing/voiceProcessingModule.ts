import { TranscriptionService } from './domain/transcriptionService';
import { ProcessVoiceInputUseCase } from './application/processVoiceInput';
import { ProcessTextInputUseCase } from './application/processTextInput';
import { TransactionModule } from '../transaction/transactionModule';
import { DebtModule } from '../debt/debtModule';

export class VoiceProcessingModule {
  constructor(
    private openAIService: TranscriptionService,
    private transactionModule: TransactionModule,
    private debtModule?: DebtModule
  ) {}

  getProcessVoiceInputUseCase(): ProcessVoiceInputUseCase {
    return new ProcessVoiceInputUseCase(
      this.openAIService,
      this.transactionModule.getCreateTransactionUseCase(),
      this.debtModule?.createDebtUseCase
    );
  }

  getProcessTextInputUseCase(): ProcessTextInputUseCase {
    return new ProcessTextInputUseCase(
      this.openAIService,
      this.transactionModule.getCreateTransactionUseCase(),
      this.debtModule?.createDebtUseCase
    );
  }
}
