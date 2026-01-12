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

async function runMigration() {
  console.log('🚀 Running Supabase migration...');
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env file');
    return;
  }
  
  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    
    // Read the migration file
    const migrationPath = path.join(process.cwd(), 'migrations', '001_initial_schema.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📄 Executing migration SQL...');
    
    // Split SQL into individual statements (basic approach)
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    for (const [index, statement] of statements.entries()) {
      if (statement.toLowerCase().includes('create extension')) {
        console.log(`⏭️  Skipping extension creation (statement ${index + 1})`);
        continue;
      }
      
      if (statement.toLowerCase().includes('create table')) {
        const tableName = statement.match(/create table[^(]*?(\w+)/i)?.[1];
        console.log(`📋 Creating table: ${tableName}...`);
      } else if (statement.toLowerCase().includes('create index')) {
        const indexName = statement.match(/create index[^(]*?(\w+)/i)?.[1];
        console.log(`🔍 Creating index: ${indexName}...`);
      } else if (statement.toLowerCase().includes('create trigger')) {
        const triggerName = statement.match(/create trigger[^(]*?(\w+)/i)?.[1];
        console.log(`⚡ Creating trigger: ${triggerName}...`);
      } else if (statement.toLowerCase().includes('create or replace function')) {
        console.log(`⚙️  Creating function...`);
      }
      
      try {
        const { error } = await supabase.rpc('execute_sql', { sql: statement + ';' });
        if (error) {
          // Try alternative approach - this might not work for all statements
          console.log(`⚠️  RPC approach failed for statement ${index + 1}, this is expected for some DDL statements`);
          console.log(`Statement: ${statement.substring(0, 100)}...`);
        }
      } catch (err) {
        console.log(`⚠️  Could not execute statement ${index + 1} via Supabase client (expected for DDL)`);
      }
    }
    
    console.log('\n📋 Migration script prepared. Since DDL statements require direct database access,');
    console.log('please run the following SQL in your Supabase SQL Editor:');
    console.log('📁 Location: migrations/001_initial_schema.sql');
    console.log('🌐 Supabase Dashboard: https://supabase.com/dashboard');
    
    // Test if tables were created manually
    console.log('\n🔍 Checking if tables exist...');
    
    try {
      const { data: transactions, error: transError } = await supabase
        .from('transactions')
        .select('count')
        .limit(1);
        
      if (!transError) {
        console.log('✅ Transactions table exists');
      }
    } catch (err) {
      console.log('❌ Transactions table not found');
    }
    
    try {
      const { data: budgets, error: budgetError } = await supabase
        .from('budgets')
        .select('count')
        .limit(1);
        
      if (!budgetError) {
        console.log('✅ Budgets table exists');
      }
    } catch (err) {
      console.log('❌ Budgets table not found');
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  }
}

runMigration();