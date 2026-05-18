/** InnerVoice Conversational AI agent (ElevenLabs dashboard). */
export const INNERVOICE_AGENT_ID = 'agent_9401krssabvyfd4bkam1tamgw70g'

export function getElevenLabsAgentId(): string {
  const fromEnv = import.meta.env.VITE_ELEVENLABS_AGENT_ID as string | undefined
  const id = (fromEnv?.trim() || INNERVOICE_AGENT_ID).trim()
  if (!id) {
    throw new Error(
      'Missing ElevenLabs agent ID. Add VITE_ELEVENLABS_AGENT_ID to .env (InnerVoice agent).',
    )
  }
  return id
}
