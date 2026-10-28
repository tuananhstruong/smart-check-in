import { createClient } from "@supabase/supabase-js";

// The user's own external Supabase project. The anon key is a public, browser-safe key.
const EXTERNAL_SUPABASE_URL = "https://qzpgyljnxzcxmtwrksno.supabase.co";
const EXTERNAL_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6cGd5bGpueHpjeG10d3Jrc25vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5OTgzMTcsImV4cCI6MjEwODU3NDMxN30.INmgYb2wM_8lENcbT32XpgNrm1D9Bm-uLBToiYc2uHE";

export const supabase = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY);
