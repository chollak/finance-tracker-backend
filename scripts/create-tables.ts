import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
const loadEnvironment = () => {
  const localEnvPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(localEnvPath)) {
    dotenv.config({ path: localEnvPath });
  } else {
    dotenv.config();
  }
};

loadEnvironment();

async function createTables() {
  console.log('🏗️  Creating Supabase tables...');
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ SUPABASE_URL and SUPABASE_ANON_KEY must be set');
    return;
  }
  
  console.log('\n📋 To create the necessary tables, please:');
  console.log('1. Open your Supabase dashboard: https://supabase.com/dashboard');
  console.log(`2. Go to your project: ${supabaseUrl}`);
  console.log('3. Navigate to SQL Editor');
  console.log('4. Copy and paste the following SQL:');
  console.log('\n' + '='.repeat(50));
  
  // Read and display the migration SQL
  const migrationPath = path.join(process.cwd(), 'migrations', '001_initial_schema.sql');
  const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
  console.log(migrationSQL);
  console.log('='.repeat(50));
  
  console.log('\n5. Click "RUN" to execute the SQL');
  console.log('6. After running the SQL, run: npm run test:supabase');
  
  // Test current state
  console.log('\n🔍 Current table status:');
  
  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    
    // Check transactions table
    try {
      await supabase.from('transactions').select('count').limit(1);
      console.log('✅ transactions table exists');
    } catch (err: any) {
      if (err.message?.includes('does not exist')) {
        console.log('❌ transactions table missing');
      } else {
        console.log('⚠️  transactions table status unknown:', err.message);
      }
    }
    
    // Check budgets table
    try {
      await supabase.from('budgets').select('count').limit(1);
      console.log('✅ budgets table exists');
    } catch (err: any) {
      if (err.message?.includes('does not exist')) {
        console.log('❌ budgets table missing');
      } else {
        console.log('⚠️  budgets table status unknown:', err.message);
      }
    }
    
  } catch (error) {
    console.error('❌ Error checking tables:', error);
  }
}

createTables();