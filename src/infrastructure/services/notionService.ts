import { Transaction } from '../../modules/transaction/domain/transactionEntity';
import { Client } from '@notionhq/client';

export class NotionService {
    private notion: Client;
    private databaseId: string;

    constructor(apiKey: string, databaseId: string) {
        if (!apiKey) {
            throw new Error('NOTION_API_KEY is not set');
        }
        if (!databaseId) {
            throw new Error('NOTION_DATABASE_ID is not set');
        }
        this.notion = new Client({ auth: apiKey });
        this.databaseId = databaseId;
    }

    async saveTransaction(transaction: Transaction): Promise<string> {
        const page = await this.notion.pages.create({
            parent: { database_id: this.databaseId },
            properties: {
                Date: {
                    date: {
                        start: transaction.date,
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
    }

    async getTransactions(): Promise<Transaction[]> {
        try {
            const response = await this.notion.databases.query({
                database_id: this.databaseId,
            });

            return response.results.map((page: any): Transaction => ({
                date: page.properties.Date.date.start,   // Строка или дата
                category: page.properties.Category.select.name, // Категория
                description: page.properties.Description.title[0].text.content,  // Описание
                amount: page.properties.Amount.number,   // Сумма
                type: page.properties.Type.select.name === 'Income' ? 'income' : 'expense', // Тип транзакции
                userId: page.properties.UserId.rich_text[0]?.plain_text || '',
                userName: page.properties.UserName?.rich_text[0]?.plain_text,
            }));
        } catch (error: any) {
            console.log(error);
            throw new Error("Notion API Error: " + error.message);
        }
    }

    async deleteTransaction(id: string): Promise<void> {
        await this.notion.pages.update({ page_id: id, archived: true });
    }
}
