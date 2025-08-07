import { Transaction } from '../../modules/transaction/domain/transactionEntity';
import { Client } from '@notionhq/client';
import { AppConfig } from '../../config/appConfig';
import { ErrorFactory } from '../../shared/errors/AppError';
import { ERROR_MESSAGES } from '../../shared/constants/messages';

export class NotionService {
    private notion: Client;
    private databaseId: string;

    constructor(apiKey?: string, databaseId?: string) {
        const key = apiKey || AppConfig.NOTION_API_KEY;
        const dbId = databaseId || AppConfig.NOTION_DATABASE_ID;
        
        if (!key) {
            throw ErrorFactory.configuration('NOTION_API_KEY is not set');
        }
        if (!dbId) {
            throw ErrorFactory.configuration('NOTION_DATABASE_ID is not set');
        }
        
        this.notion = new Client({ auth: key });
        this.databaseId = dbId;
    }

    async saveTransaction(transaction: Transaction): Promise<string> {
        try {
            const page = await this.notion.pages.create({
                parent: { database_id: this.databaseId },
                properties: {
                    Date: {
                        date: {
                            start: transaction.date || new Date().toISOString().split('T')[0],
                        },
                    },
                    Category: {
                        select: { name: transaction.category },
                    },
                    Description: {
                        title: [
                            {
                                text: { content: transaction.description },
                            },
                        ],
                    },
                    Amount: {
                        number: transaction.amount,
                    },
                    Type: {
                        select: { name: transaction.type === 'income' ? 'Income' : 'Expense' },
                    },
                    UserId: {
                        rich_text: [
                            {
                                text: { content: transaction.userId },
                            },
                        ],
                    },
                    UserName: {
                        rich_text: [
                            {
                                text: { content: transaction.userName || transaction.userId },
                            },
                        ],
                    },
                },
            });
            return (page as any).id as string;
        } catch (error) {
            console.error('Notion save error:', error);
            throw ErrorFactory.externalService('Notion', error instanceof Error ? error : undefined);
        }
    }

    async getTransactions(): Promise<Transaction[]> {
        try {
            const response = await this.notion.databases.query({
                database_id: this.databaseId,
            });

            return response.results.map((page: any): Transaction => ({
                date: page.properties.Date?.date?.start || new Date().toISOString().split('T')[0],
                category: page.properties.Category?.select?.name || 'Other',
                description: page.properties.Description?.title?.[0]?.text?.content || 'No description',
                amount: page.properties.Amount?.number || 0,
                type: page.properties.Type?.select?.name === 'Income' ? 'income' : 'expense',
                userId: page.properties.UserId?.rich_text?.[0]?.plain_text || '',
                userName: page.properties.UserName?.rich_text?.[0]?.plain_text,
            }));
        } catch (error) {
            console.error('Notion get transactions error:', error);
            throw ErrorFactory.externalService('Notion', error instanceof Error ? error : undefined);
        }
    }

    async deleteTransaction(id: string): Promise<void> {
        try {
            await this.notion.pages.update({ page_id: id, archived: true });
        } catch (error) {
            console.error('Notion delete transaction error:', error);
            throw ErrorFactory.externalService('Notion', error instanceof Error ? error : undefined);
        }
    }
}
