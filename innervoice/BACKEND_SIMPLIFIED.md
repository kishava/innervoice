# InnerVoice Backend (Simple)

This project now uses a simple backend model:

1. Supabase Auth for login/register/session.
2. `profiles` table for user profile and `voice_id`.
3. `conversations` + `messages` tables for chat history.
4. Frontend uses only Supabase as source of truth (no conversation localStorage fallback).
5. OpenAI/ElevenLabs requests go through Supabase Edge Function `ai-gateway`.

## Key files

- `src/lib/supabase.ts` - Supabase client.
- `src/AuthContext.tsx` - Auth + profile read/write.
- `src/hooks/useConversations.ts` - conversation/message read/write.
- `supabase/migrations/20260517021900_init_innervoice.sql` - DB schema + RLS.
- `supabase/functions/ai-gateway/index.ts` - secure AI gateway.

## Environment

Required in `.env`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Server-only Supabase secrets (set via CLI/dashboard, not frontend `.env`):

- `OPENAI_API_KEY`
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_AGENT_ID` — Conversational AI agent ID for **Talk** (live voice). Create an agent at [ElevenLabs Agents](https://elevenlabs.io/app/conversational-ai), copy its ID, then set the secret. Per-session voice + future-self prompt are overridden in the app.

## Troubleshooting

- Login fails:
  - Check Auth provider is enabled in Supabase (`Email` provider).
  - Verify `.env` URL/key are correct.
- No history shown:
  - Check `conversations` and `messages` tables contain rows for the current user.
  - Check RLS policies are applied (migration pushed).
- Profile not updating:
  - Confirm `profiles` row exists for current user id.

## DB operations

From repo root:

```bash
npx supabase link --project-ref sfkjycsvkhkcxoabcyjo
npx supabase db push
npx supabase secrets set OPENAI_API_KEY=... ELEVENLABS_API_KEY=... ELEVENLABS_AGENT_ID=...
npx supabase functions deploy ai-gateway
```

