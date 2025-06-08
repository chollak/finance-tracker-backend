import { Transaction } from '../../modules/transaction/domain/transactionEntity';
import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
dotenv.config();

export class NotionService {
    private notion: Client;
    private databaseId: string;

    constructor() {
        this.notion = new Client({ auth: process.env.NOTION_API_KEY });
        this.databaseId = process.env.NOTION_DATABASE_ID || '';  // Здесь должен быть ID базы данных в Notion
    }

    async saveTransaction(transaction: Transaction): Promise<void> {
        await this.notion.pages.create({
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
            },
        });
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
            }));
        } catch (error: any) {
            console.log(error);
            throw new Error("Notion API Error: " + error.message);
        }
    }
}
