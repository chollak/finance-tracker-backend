import { AppDataSource } from '../database.config';
import { User, Category, Transaction as TransactionEntity, Account, TransactionType, AccountType } from '../entities';
import { NotionService } from '../../infrastructure/services/notionService';
import { AppConfig } from '../../config/appConfig';

export class NotionToSqliteMigration1723982400000 {
  private notionService: NotionService;

  constructor() {
    this.notionService = new NotionService();
  }

  async migrate(): Promise<void> {
    console.log('🔄 Starting Notion to SQLite migration...');

    try {
      // 1. Export data from Notion
      const notionTransactions = await this.exportFromNotion();
      console.log(`📥 Exported ${notionTransactions.length} transactions from Notion`);

      // 2. Create users from transaction data
      const users = await this.createUsers(notionTransactions);
      console.log(`👥 Created ${users.length} users`);

      // 3. Create default categories for each user
      const categories = await this.createDefaultCategories(users);
      console.log(`📁 Created ${categories.length} categories`);

      // 4. Create default accounts for each user  
      const accounts = await this.createDefaultAccounts(users);
      console.log(`🏦 Created ${accounts.length} accounts`);

      // 5. Import transactions with proper relationships
      const transactions = await this.importTransactions(notionTransactions, users, categories, accounts);
      console.log(`💰 Imported ${transactions.length} transactions`);

      console.log('✅ Migration completed successfully!');

    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    }
  }

  private async exportFromNotion(): Promise<any[]> {
    try {
      return await this.notionService.getTransactions();
    } catch (error) {
      console.warn('⚠️ Could not export from Notion (this is OK if starting fresh):', error);
      return [];
    }
  }

  private async createUsers(transactions: any[]): Promise<User[]> {
    const userRepository = AppDataSource.getRepository(User);
    const uniqueUsers = new Map<string, any>();

    // Extract unique users from transactions
    transactions.forEach(tx => {
      if (tx.userId && !uniqueUsers.has(tx.userId)) {
        uniqueUsers.set(tx.userId, {
          telegramId: tx.userId,
          firstName: tx.userName?.split(' ')[0] || undefined,
          lastName: tx.userName?.split(' ')[1] || undefined,
          language: 'ru',
          currency: 'UZS'
        });
      }
    });

    const users: User[] = [];
    for (const userData of Array.from(uniqueUsers.values())) {
      let user: User;
      
      const existingUser = await userRepository.findOne({
        where: { telegramId: userData.telegramId }
      });

      if (existingUser) {
        user = existingUser;
      } else {
        const newUserData = userRepository.create(userData);
        const result = await userRepository.save(newUserData);
        user = Array.isArray(result) ? result[0] : result;
      }
      
      users.push(user);
    }

    return users;
  }

  private async createDefaultCategories(users: User[]): Promise<Category[]> {
    const categoryRepository = AppDataSource.getRepository(Category);
    const defaultCategories = [
      { name: 'Еда', color: '#FF6B6B', icon: '🍔' },
      { name: 'Транспорт', color: '#4ECDC4', icon: '🚗' },
      { name: 'Развлечения', color: '#45B7D1', icon: '🎬' },
      { name: 'Покупки', color: '#F9CA24', icon: '🛍️' },
      { name: 'Здоровье', color: '#6C5CE7', icon: '🏥' },
      { name: 'Жилье', color: '#A0E7E5', icon: '🏠' },
      { name: 'Образование', color: '#FD79A8', icon: '📚' },
      { name: 'Зарплата', color: '#00B894', icon: '💰' },
      { name: 'Подарки', color: '#FDCB6E', icon: '🎁' },
      { name: 'Другое', color: '#636E72', icon: '❓' }
    ];

    const categories: Category[] = [];
    
    for (const user of users) {
      for (const catData of defaultCategories) {
        const category = categoryRepository.create({
          ...catData,
          userId: user.telegramId,
          isDefault: true
        });
        
        const saved = await categoryRepository.save(category);
        categories.push(saved);
      }
    }

    return categories;
  }

  private async createDefaultAccounts(users: User[]): Promise<Account[]> {
    const accountRepository = AppDataSource.getRepository(Account);
    const accounts: Account[] = [];

    for (const user of users) {
      const defaultAccount = accountRepository.create({
        name: 'Основной счёт',
        type: AccountType.CASH,
        balance: 0,
        currency: 'UZS',
        userId: user.telegramId,
        description: 'Основной счёт для транзакций'
      });

      const saved = await accountRepository.save(defaultAccount);
      accounts.push(saved);
    }

    return accounts;
  }

  private async importTransactions(
    notionTransactions: any[], 
    users: User[], 
    categories: Category[], 
    accounts: Account[]
  ): Promise<TransactionEntity[]> {
    const transactionRepository = AppDataSource.getRepository(TransactionEntity);
    const transactions: TransactionEntity[] = [];

    for (const tx of notionTransactions) {
      const user = users.find(u => u.telegramId === tx.userId);
      if (!user) continue;

      // Find or create category
      let category = categories.find(c => 
        c.userId === user.telegramId && 
        c.name.toLowerCase() === tx.category?.toLowerCase()
      );
      
      if (!category) {
        category = categories.find(c => 
          c.userId === user.telegramId && c.name === 'Другое'
        );
      }

      // Get default account
      const account = accounts.find(a => a.userId === user.telegramId);

      const transaction = transactionRepository.create({
        amount: tx.amount,
        type: tx.type === 'income' ? TransactionType.INCOME : TransactionType.EXPENSE,
        description: tx.description || '',
        date: tx.date,
        merchant: tx.merchant,
        confidence: tx.confidence,
        originalText: tx.originalText,
        originalParsing: tx.originalParsing ? JSON.stringify(tx.originalParsing) : undefined,
        userId: user.telegramId,
        categoryId: category?.id,
        accountId: account?.id
      });

      const saved = await transactionRepository.save(transaction);
      transactions.push(saved);
    }

    return transactions;
  }
}