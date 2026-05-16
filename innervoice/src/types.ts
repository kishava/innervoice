export type AppStep = 'auth' | 'home' | 'recording' | 'cloning' | 'chat'

export type Emotion =
  | 'neutral'
  | 'sad'
  | 'anxious'
  | 'angry'
  | 'fearful'
  | 'stressed'
  | 'lonely'
  | 'hurt'
  | 'grieving'
  | 'confused'
  | 'ashamed'
  | 'guilty'
  | 'tired'
  | 'hopeful'
  | 'grateful'
  | 'excited'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  text: string
  audioUrl?: string
  timestamp: number
  emotion?: Emotion
}

export interface Conversation {
  id: string
  title: string
  voiceId: string
  messages: Message[]
  createdAt: number
  updatedAt: number
}
