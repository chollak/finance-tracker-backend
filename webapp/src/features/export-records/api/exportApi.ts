import { apiClient } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants/routes';
import { fileNameFromDisposition, type ExportedFile } from '../model/exportRecords';

/** Telegram: the server makes the file and sends it to the chat with the bot (POST /api/export/chat). */
export async function sendRecordsToChat(): Promise<ExportedFile> {
  const response = await apiClient.post<ExportedFile>(API_ENDPOINTS.EXPORT.CHAT);
  return response.data;
}

/** A browser: the file itself (GET /api/export), named by the server, with how many records it has. */
export async function downloadRecords(): Promise<ExportedFile & { blob: Blob }> {
  const { blob, headers } = await apiClient.getFile(API_ENDPOINTS.EXPORT.FILE);
  return {
    blob,
    fileName: fileNameFromDisposition(headers.get('Content-Disposition')) ?? 'kapelka.csv',
    count: Number(headers.get('X-Export-Count') ?? 0) || 0,
  };
}
