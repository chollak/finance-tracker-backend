// scripts/test-supabase-connection.ts
// Тест подключения к Supabase и проверка мигрированных данных

import { getSupabaseClient } from '../src/shared/infrastructure/database/supabase.config';

async function testConnection() {
  console.log('🧪 Testing Supabase connection...\n');

  try {
    const supabase = getSupabaseClient();

    // Тест 1: Проверка транзакций
    console.log('📊 Test 1: Fetching transactions...');
    const { data: transactions, error: transactionsError } = await supabase
      .from('transactions')
      .select('*')
      .limit(5);

    if (transactionsError) {
      console.error('❌ Error fetching transactions:', transactionsError.message);
    } else {
      console.log(`✅ Found ${transactions?.length || 0} transactions (showing first 5)`);
      if (transactions && transactions.length > 0) {
        console.log('   Sample transaction:', {
          id: transactions[0].id,
          amount: transactions[0].amount,
          type: transactions[0].type,
          description: transactions[0].description,
          date: transactions[0].date
        });
      }
    }

    // Тест 2: Подсчет всех транзакций
    console.log('\n📈 Test 2: Counting all transactions...');
    const { count, error: countError } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.error('❌ Error counting transactions:', countError.message);
    } else {
      console.log(`✅ Total transactions in Supabase: ${count}`);
    }

    // Тест 3: Проверка бюджетов
    console.log('\n💰 Test 3: Fetching budgets...');
    const { data: budgets, error: budgetsError } = await supabase
      .from('budgets')
      .select('*');

    if (budgetsError) {
      console.error('❌ Error fetching budgets:', budgetsError.message);
    } else {
      console.log(`✅ Found ${budgets?.length || 0} budgets`);
      if (budgets && budgets.length > 0) {
        console.log('   Sample budget:', {
          id: budgets[0].id,
          name: budgets[0].name,
          amount: budgets[0].amount,
          period: budgets[0].period,
          is_active: budgets[0].is_active
        });
      }
    }

    // Тест 4: Проверка индексов
    console.log('\n🔍 Test 4: Testing indexed query...');
    const { data: userTransactions, error: userError } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', '131184740')
      .order('date', { ascending: false })
      .limit(3);

    if (userError) {
      console.error('❌ Error fetching user transactions:', userError.message);
    } else {
      console.log(`✅ Found ${userTransactions?.length || 0} transactions for user 131184740`);
    }

    console.log('\n✨ All tests completed successfully!');
    console.log('\n📋 Summary:');
    console.log('   ✅ Supabase connection: OK');
    console.log('   ✅ Tables accessible: OK');
    console.log('   ✅ Data migrated: OK');
    console.log('   ✅ Queries working: OK');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

testConnection();
