import { TranscriptionService } from './domain/transcriptionService';
import { ProcessVoiceInputUseCase } from './application/processVoiceInput';
import { ProcessTextInputUseCase } from './application/processTextInput';
import { TransactionModule } from '../transaction/transactionModule';
import { DebtModule } from '../debt/debtModule';
import { UserCategorySource } from './domain/categoryPrompt';

export class VoiceProcessingModule {
  constructor(
    private openAIService: TranscriptionService,
    private transactionModule: TransactionModule,
    private debtModule?: DebtModule,
    /** The user's categories for the parser prompt (FT-099). */
    private categorySource?: UserCategorySource
  ) {}

  getProcessVoiceInputUseCase(): ProcessVoiceInputUseCase {
    return new ProcessVoiceInputUseCase(
      this.openAIService,
      this.transactionModule.getCreateTransactionUseCase(),
      this.debtModule?.createDebtUseCase,
      this.categorySource
    );
  }

  getProcessTextInputUseCase(): ProcessTextInputUseCase {
    return new ProcessTextInputUseCase(
      this.openAIService,
      this.transactionModule.getCreateTransactionUseCase(),
      this.debtModule?.createDebtUseCase,
      this.categorySource
    );
  }
}
