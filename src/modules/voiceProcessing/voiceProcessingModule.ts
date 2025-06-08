import { OpenAITranscriptionService } from './infrastructure/openAITranscriptionService';
import { ProcessVoiceInputUseCase } from './application/processVoiceInput';
import { ProcessTextInputUseCase } from './application/processTextInput';
import { TransactionModule } from '../transaction/transactionModule';

export class VoiceProcessingModule {
    private static openAIService = new OpenAITranscriptionService();

    static getProcessVoiceInputUseCase(): ProcessVoiceInputUseCase {
        return new ProcessVoiceInputUseCase(
            this.openAIService,
            TransactionModule.getCreateTransactionUseCase()
        );
    }

    static getProcessTextInputUseCase(): ProcessTextInputUseCase {
        return new ProcessTextInputUseCase(
            this.openAIService,
            TransactionModule.getCreateTransactionUseCase()
        );
    }
}
