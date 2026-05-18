# InnerVoice Backend (Simple)

This project now uses a simple backend model:

1. Supabase Auth for login/register/session.
2. `profiles` table for user profile and `voice_id`.
3. `conversations` + `messages` tables for chat history.
4. `user_voices` table for named trained voices (multiple per user); `profiles.voice_id` is the active voice for chat.
4. Frontend uses only Supabase as source of truth (no conversation localStorage fallback).
5. OpenAI/ElevenLabs TTS/clone/STT go through Supabase Edge Function `ai-gateway`.
6. **Talk** (live voice) uses `@elevenlabs/react` with agent id `agent_9401krssabvyfd4bkam1tamgw70g` (WebRTC) and per-session overrides for voice + prompt.

## Key files

- `src/lib/supabase.ts` - Supabase client.
- `src/lib/elevenLabsConvai.ts` - InnerVoice agent id for Talk.
- `src/features/liveTalk/LiveTalkPage.tsx` - live conversation UI.
- `src/AuthContext.tsx` - Auth + profile read/write.
- `src/hooks/useConversations.ts` - conversation/message read/write.
- `supabase/migrations/20260517021900_init_innervoice.sql` - DB schema + RLS.
- `supabase/functions/ai-gateway/index.ts` - secure AI gateway (chat TTS, not live Talk).

## Environment

Required in `.env`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_ELEVENLABS_AGENT_ID` — optional; defaults to InnerVoice agent `agent_9401krssabvyfd4bkam1tamgw70g`

Server-only Supabase secrets (set via CLI/dashboard, not frontend `.env`):

- `OPENAI_API_KEY`
- `ELEVENLABS_API_KEY`

**Talk setup:** In [ElevenLabs Agents](https://elevenlabs.io/app/conversational-ai), open **InnerVoice** → **Security** and allow overrides for **prompt**, **first message**, **language**, and **voice**.

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
npx supabase secrets set OPENAI_API_KEY=... ELEVENLABS_API_KEY=...
npx supabase functions deploy ai-gateway
```

