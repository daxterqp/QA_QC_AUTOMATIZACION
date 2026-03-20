import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uimlobhczjctoytejkgh.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpbWxvYmhjempjdG95dGVqa2doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3ODYzODQsImV4cCI6MjA4OTM2MjM4NH0.LawnHHTjCQMYgYw7fXX_tvz-wBTps-M1W4bsz_2eXZI';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
