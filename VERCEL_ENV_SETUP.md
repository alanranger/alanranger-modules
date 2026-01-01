# Vercel Environment Variables Setup

Add these environment variables to your Vercel project:

## Required Variables

1. **MEMBERSTACK_SECRET_KEY**
   - Get this from Memberstack Dashboard → Settings → API Keys
   - This is your admin/secret key (not the public key)
   - Used to verify Memberstack tokens on the server

2. **SUPABASE_URL**
   - Your Supabase project URL
   - Example: `https://dqrtcsvqsfgbqmnonkpt.supabase.co`

3. **SUPABASE_SERVICE_ROLE_KEY**
   - Get this from Supabase Dashboard → Settings → API → service_role key
   - ⚠️ **NEVER expose this to the browser** - server-only
   - Used for server-side database operations with full permissions

## Optional Variables

4. **EXAMS_API_ORIGIN** (Optional)
   - Allowed origin for CORS requests
   - Default: `https://www.alanranger.com`
   - Only set if you need to allow a different origin
   - Example: `https://api.alanranger.com` (if API is on subdomain)

## How to Add in Vercel

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add each variable:
   - **Key**: Variable name (e.g., `MEMBERSTACK_SECRET_KEY`)
   - **Value**: The actual secret value
   - **Environment**: Select all (Production, Preview, Development)
4. Click **Save**
5. Redeploy your project for changes to take effect

## Security Notes

- Never commit these values to git
- The service role key has full database access - keep it secure
- Memberstack secret key can read/write member data - protect it
