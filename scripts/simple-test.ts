import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const loadEnvironment = () => {
  const localEnvPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(localEnvPath)) {
    dotenv.config({ path: localEnvPath });
  }
};

loadEnvironment();

async function simpleTest() {
  console.log('🔍 Simple Supabase test...');
  
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
  );
  
  try {
    // Test direct SQL query
    console.log('📊 Checking schema...');
    const { data, error } = await supabase
      .rpc('execute_sql', { 
        sql: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'" 
      });
    
    if (error) {
      console.log('RPC not available, trying direct table access...');
      
      // Try to insert a test transaction
      const { data: insertData, error: insertError } = await supabase
        .from('transactions')
        .insert({
          amount: 100.00,
          type: 'income',
          description: 'Test transaction',
          date: new Date().toISOString().split('T')[0],
          user_id: 'test_user_123'
        })
        .select();
        
      if (insertError) {
        console.error('❌ Insert failed:', insertError);
      } else {
        console.log('✅ Insert successful:', insertData);
        
        // Clean up - delete the test record
        if (insertData && insertData.length > 0) {
          await supabase
            .from('transactions')
            .delete()
            .eq('id', insertData[0].id);
          console.log('🧹 Test record cleaned up');
        }
      }
    } else {
      console.log('📋 Available tables:', data);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

simpleTest();