import { RecordSource } from '../../transaction/domain/recordSource';

export interface VoiceInput {
    filePath: string;
    userId: string;
    userName?: string;
    /** Where the voice came from (FT-103): the bot sends `telegram`, the web API `miniapp`. */
    source?: RecordSource;
}
