import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Only the public publishable key belongs in browser code.
// Database access must be protected by Supabase RLS policies.
export const supabase = url && key ? createClient(url, key) : null;
