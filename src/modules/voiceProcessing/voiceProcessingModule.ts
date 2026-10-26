import { TranscriptionService } from './domain/transcriptionService';
import { ProcessVoiceInputUseCase } from './application/processVoiceInput';
import { ProcessTextInputUseCase } from './application/processTextInput';
import { TransactionModule } from '../transaction/transactionModule';
import { DebtModule } from '../debt/debtModule';
import { UserCategorySource } from './domain/categoryPrompt';
import { LearnedCategoryWords } from './domain/categoryGuess';

export class VoiceProcessingModule {
  constructor(
    private openAIService: TranscriptionService,
    private transactionModule: TransactionModule,
    private debtModule?: DebtModule,
    /** The user's categories for the parser prompt (FT-099). */
    private categorySource?: UserCategorySource,
    /** Learned words: a category a learned pattern gives is not the AI's guess (FT-138). */
    private learnedWords?: LearnedCategoryWords
  ) {}

  getProcessVoiceInputUseCase(): ProcessVoiceInputUseCase {
    return new ProcessVoiceInputUseCase(
      this.openAIService,
      this.transactionModule.getCreateTransactionUseCase(),
      this.debtModule?.createDebtUseCase,
      this.categorySource,
      this.learnedWords
    );
  }

  getProcessTextInputUseCase(): ProcessTextInputUseCase {
    return new ProcessTextInputUseCase(
      this.openAIService,
      this.transactionModule.getCreateTransactionUseCase(),
      this.debtModule?.createDebtUseCase,
      this.categorySource,
      this.learnedWords
    );
  }
}
