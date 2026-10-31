import { RecordSource } from '../../transaction/domain/recordSource';

export interface VoiceInput {
    filePath: string;
    userId: string;
    userName?: string;
    /** Where the voice came from (FT-103): the bot sends `telegram`, the web API `miniapp`. */
    source?: RecordSource;
    /** The client's id for what was said (FT-106, FT-167): its records get «<id>», «<id>:1», … */
    clientId?: string;
    /**
     * The day it was said, YYYY-MM-DD on the user's calendar (FT-182): a voice the bot reads the morning after it was
     * sent is dated by the day it was sent. Today when absent.
     */
    today?: string;
}
