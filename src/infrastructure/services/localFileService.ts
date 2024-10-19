import { promises as fs } from 'fs';
import { Transaction } from '../../domain/entity/transaction';

export class LocalFileService {
    private filePath: string = './data/transactions.json';

    async saveTransaction(transaction: Transaction): Promise<void> {
        try {
            const data = await fs.readFile(this.filePath, 'utf-8');
            const transactions = JSON.parse(data) as Transaction[];
            transactions.push(transaction);
            await fs.writeFile(this.filePath, JSON.stringify(transactions, null, 2));
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                await fs.writeFile(this.filePath, JSON.stringify([transaction], null, 2));
            } else {
                throw new Error("File system error: " + error.message);
            }
            // console.error('Ошибка при записи в файл:', error);
        }
    }

    async getTransactions(): Promise<Transaction[]> {
        try {
            const fileData = await fs.readFile(this.filePath, 'utf8');
            return JSON.parse(fileData);
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                return []; // Если файл не существует, возвращаем пустой список
            } else {
                throw new Error("File system error: " + error.message);
            }
        }
    }
}
