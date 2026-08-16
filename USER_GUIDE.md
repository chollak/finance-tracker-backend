# Finance Tracker User Guide

Complete guide to using the AI-powered finance tracker through Telegram and web application.

## Getting Started

### 1. Start the Telegram Bot

Open Telegram and find your bot, then send:
```
/start
```

You'll see:
- Welcome message
- "📊 Open Transactions" button to launch the web app

### 2. Ways to Add Transactions

#### Voice Messages (Recommended)
1. Press and hold the microphone icon in Telegram
2. Speak your transaction naturally in Russian or English:
   - "Купил кофе за 500 рублей"
   - "Spent $50 on groceries"
   - "Получил зарплату 100 тысяч"
3. Release to send
4. Bot will auto-save if confidence is high (≥60%)
5. Low confidence transactions will ask for confirmation

#### Text Messages
Just type your transaction:
```
Потратил 1500 на такси
Зарплата 150000
Coffee $5
```

AI will parse:
- Amount (500, $50, 100000)
- Category (Coffee → Food, Taxi → Transportation)
- Type (expense or income)
- Merchant name (if mentioned)

### 3. Bot Commands

- `/start` - Welcome message with app link
- `/transactions` - Open transactions web app

### 4. Managing Transactions

#### Inline Buttons (Telegram)
After creating a transaction, you'll see buttons:
- **✏️ Edit** - Opens web app to edit transaction details
- **🗑️ Delete** - Deletes transaction (only your most recent one)
- **✅ Confirm** - Confirm low-confidence transactions
- **📊 Open app** - View all transactions in web app

#### Web App Features

**Home (`/`):**
- Current balance overview
- Recent transactions and budget snapshot
- Quick access to the main sections

**Transactions (`/transactions`):**
- Search by description or category
- Filter by type (Income/Expense) or specific categories
- Edit any transaction via `/transactions/:id/edit`
- Add a transaction via `/transactions/add`
- Delete transactions with confirmation
- Auto-grouped by date (Today, Yesterday, This Week, Earlier)

**Budgets (`/budgets`):**
- Create budgets via `/budgets/add` (name, amount, period, date range)
- Track spending progress with visual progress bars
- Budget alerts (Over Budget, Near Limit, Ending Soon)
- Edit budget details via `/budgets/:id/edit`
- Delete budgets
- Filter by categories

**Debts (`/debts`):**
- List of debts (who owes whom) with status
- Create a debt via `/debts/add`
- Debt details and payment history via `/debts/:id`

**Analytics (`/analytics`):**
- Financial Health Score (0-100)
- Key metrics: Net Income, Budget Utilization, Savings Rate
- Alerts for over-budget or near-limit budgets
- Monthly trends, weekly spending patterns, top categories

**More (`/more`):**
- Settings, subscription status, and secondary sections

### 5. Budget Management

#### Creating a Budget
1. Go to Budgets page → "Create Budget"
2. Fill form:
   - Name (e.g., "Monthly Food Budget")
   - Amount (e.g., 50000)
   - Period (Weekly/Monthly/Quarterly/Yearly)
   - Start/End dates (auto-calculated based on period)
   - Categories (optional - select relevant categories)
   - Description (optional notes)
3. Click "Create Budget"

#### Budget Alerts
- **Over Budget** (red) - You've exceeded the budget amount
- **Near Limit** (orange) - Used ≥80% of budget
- **Ending Soon** - Less than 7 days remaining

#### Editing Budgets
Click "Edit" on any budget card to modify:
- Budget name, amount, dates
- Period type
- Categories
- Description

### 6. AI Processing Details

**Voice to Transaction Flow:**
1. Voice → OpenAI Whisper (speech-to-text)
2. Text → GPT-4 (parse transaction details)
3. Transaction created in database
4. Machine learning improves over time based on your edits

**Confidence System:**
- High confidence (≥60%): Auto-saved
- Low confidence (<60%): Asks for confirmation
- Edit corrections help AI learn your patterns

**Supported Languages:**
- Russian (default)
- English
- Mixed language input works

### 7. Data & Privacy

**Database Options:**
- SQLite (local file storage for development)
- Supabase (cloud PostgreSQL for production)

**Data Stored:**
- Transaction history (amount, category, date, description)
- Budget definitions and progress
- User ID from Telegram
- OpenAI API usage statistics

**Not Stored:**
- Bank account details
- Payment card numbers
- Passwords

### 8. Common Use Cases

#### Track Daily Expenses
Send voice/text messages throughout the day:
```
"Обед 800 рублей"
"Такси 500"
"Купил книгу за 1500"
```

#### Monthly Budget Tracking
1. Create monthly budgets for each category
2. Add transactions as you spend
3. Check Budgets for alerts
4. Review Analytics at month-end

#### Salary Management
```
"Зарплата 200000" → Income recorded
Check balance on Home
Set budgets for the month
```

### 9. Tips & Best Practices

**For Better AI Recognition:**
- Include amount and category in your message
- Be specific: "Кофе 300" better than just "300"
- Mention merchant: "Starbucks 500" helps categorization

**Budget Strategy:**
- Start with 3-5 main budgets (Food, Transport, Entertainment)
- Set realistic amounts based on past spending
- Review Budget Alerts weekly
- Adjust budgets monthly based on Analytics insights

**Efficient Workflow:**
- Use voice for quick logging on-the-go
- Use web app for detailed review and editing
- Check Analytics weekly for financial health

### 10. Troubleshooting

**"No transactions found in your message"**
→ Include amount and category: "Coffee 500"

**Transaction categorized incorrectly**
→ Click Edit → Change category → AI learns from correction

**Can't delete transaction**
→ Only most recent transaction can be deleted via bot
→ Use web app to delete any transaction

**Web app not loading**
→ Check WEB_APP_URL environment variable
→ Try /start command again

**Voice not recognized**
→ Speak clearly with minimal background noise
→ Try text input instead
→ Check if ffmpeg is installed on server

### 11. Development Setup (For Developers)

See [README.md](README.md) for:
- Installation instructions
- Environment configuration
- Running in development mode
- Docker deployment
- Testing

---

## Support

For issues or feature requests:
- GitHub: [Your Repository URL]
- Telegram: [Your Support Contact]

**Version:** 1.0.0 (MVP Release)
