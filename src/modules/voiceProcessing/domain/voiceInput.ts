import { TransactionSource } from '../../transaction/domain/transactionEntity';

export interface VoiceInput {
    filePath: string;
    userId: string;
    userName?: string;
    /** Канал захвата. По умолчанию telegram — сейчас голос приходит только оттуда. */
    source?: TransactionSource;
}
