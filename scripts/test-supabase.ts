import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load environment variables with priority: .env.local > .env
const loadEnvironment = () => {
  const localEnvPath = path.resolve(process.cwd(), '.env.local');
  const envPath = path.resolve(process.cwd(), '.env');
  
  if (fs.existsSync(localEnvPath)) {
    dotenv.config({ path: localEnvPath });
    console.log('Environment loaded from .env.local');
  } else if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log('Environment loaded from .env');
  }
};

loadEnvironment();

async function testSupabaseConnection() {
  console.log('🧪 Testing Supabase connection...');
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseAnonKey) {
    console.log('❌ SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env file');
    console.log('Example .env configuration:');
    console.log('SUPABASE_URL=https://your-project-ref.supabase.co');
    console.log('SUPABASE_ANON_KEY=your-anon-key-here');
    return;
  }
  
  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    
    // Test basic connection by checking if tables exist
    console.log('📋 Checking database tables...');
    
    const { data: transactions, error: transError } = await supabase
      .from('transactions')
      .select('count')
      .limit(1);
      
    if (transError) {
      if (transError.message.includes('relation "transactions" does not exist')) {
        console.log('⚠️ Transactions table does not exist. Please run the migration SQL script.');
        console.log('See SUPABASE_MIGRATION.md for instructions.');
      } else {
        throw transError;
      }
    } else {
      console.log('✅ Transactions table found');
    }
    
    const { data: budgets, error: budgetError } = await supabase
      .from('budgets')
      .select('count')
      .limit(1);
      
    if (budgetError) {
      if (budgetError.message.includes('relation "budgets" does not exist')) {
        console.log('⚠️ Budgets table does not exist. Please run the migration SQL script.');
        console.log('See SUPABASE_MIGRATION.md for instructions.');
      } else {
        throw budgetError;
      }
    } else {
      console.log('✅ Budgets table found');
    }
    
    console.log('🎉 Supabase connection test completed successfully!');
    
  } catch (error) {
    console.error('❌ Supabase connection failed:', error);
    console.log('\n📚 Setup Instructions:');
    console.log('1. Create a new project at https://supabase.com');
    console.log('2. Get your URL and anon key from project settings');
    console.log('3. Run the SQL migration script in your Supabase SQL editor');
    console.log('4. Update your .env file with the correct credentials');
  }
}

// Run the test
testSupabaseConnection();