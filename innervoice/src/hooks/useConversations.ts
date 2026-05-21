import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Conversation, Message } from '../types'
import { useAuth } from '../AuthContext'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

const ACTIVE_CONVERSATION_KEY = 'innervoice-active-conversation'

function makeTitle(messages: Message[]) {
  const firstUser = messages.find((m) => m.role === 'user')?.text ?? 'New Conversation'
  return firstUser.length > 60 ? `${firstUser.slice(0, 57)}...` : firstUser
}

function readActiveConversationId() {
  try {
    return localStorage.getItem(ACTIVE_CONVERSATION_KEY)
  } catch {
    return null
  }
}

function writeActiveConversationId(id: string | null) {
  try {
    if (id) localStorage.setItem(ACTIVE_CONVERSATION_KEY, id)
    else localStorage.removeItem(ACTIVE_CONVERSATION_KEY)
  } catch {
    /* ignore storage failures */
  }
}

export function useConversations() {
  const { isAuthenticated } = useAuth()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(() => readActiveConversationId())
  const saveQueuesRef = useRef(new Map<string, Promise<void>>())
  const deletedConversationIdsRef = useRef(new Set<string>())

  useEffect(() => {
    if (!isAuthenticated || !isSupabaseConfigured || !supabase) {
      setConversations([])
      setActiveId(null)
      return
    }
    const client = supabase

    let cancelled = false

    const loadConversations = async () => {
      const { data: authData } = await client.auth.getUser()
      const authUser = authData.user
      if (!authUser) {
        if (!cancelled) setConversations([])
        return
      }

      const { data: conversationRows, error: conversationError } = await client
        .from('conversations')
        .select('id,title,voice_id,created_at,updated_at')
        .eq('user_id', authUser.id)
        .order('updated_at', { ascending: false })

      if (conversationError) {
        if (!cancelled) setConversations([])
        return
      }

      const conversationIds = (conversationRows ?? []).map((row) => row.id)
      const messageMap = new Map<string, Message[]>()

      if (conversationIds.length > 0) {
        const { data: messageRows } = await client
          .from('messages')
          .select('id,conversation_id,role,text,audio_url,emotion,ts,created_at')
          .in('conversation_id', conversationIds)
          .order('created_at', { ascending: true })

        for (const row of messageRows ?? []) {
          const list = messageMap.get(row.conversation_id) ?? []
          list.push({
            id: row.id,
            role: row.role as 'user' | 'assistant',
            text: row.text,
            audioUrl: row.audio_url ?? undefined,
            emotion: row.emotion ?? undefined,
            timestamp: row.ts ?? Date.parse(row.created_at),
          })
          messageMap.set(row.conversation_id, list)
        }
      }

      const next = (conversationRows ?? []).map((row) => ({
        id: row.id,
        title: row.title,
        voiceId: row.voice_id,
        createdAt: Date.parse(row.created_at),
        updatedAt: Date.parse(row.updated_at),
        messages: messageMap.get(row.id) ?? [],
      }))

      if (!cancelled) {
        setConversations(next)
        const savedActiveId = readActiveConversationId()
        if (savedActiveId && next.some((item) => item.id === savedActiveId)) {
          setActiveId(savedActiveId)
        }
      }
    }

    void loadConversations()
    return () => {
      cancelled = true
    }
  }, [isAuthenticated])

  useEffect(() => {
    writeActiveConversationId(activeId)
  }, [activeId])

  const saveConversation = useCallback(
    (voiceId: string, messages: Message[]) => {
      if (!messages.length) return
      setConversations((prev) => {
        const now = Date.now()
        let next: Conversation[]
        let targetConversation: Conversation
        if (activeId) {
          next = prev.map((item) =>
            item.id === activeId ? { ...item, messages, updatedAt: now, title: makeTitle(messages) } : item,
          )
          targetConversation =
            next.find((item) => item.id === activeId) ?? {
              id: activeId,
              title: makeTitle(messages),
              voiceId,
              messages,
              createdAt: now,
              updatedAt: now,
            }
        } else {
          const created: Conversation = {
            id: crypto.randomUUID(),
            title: makeTitle(messages),
            voiceId,
            messages,
            createdAt: now,
            updatedAt: now,
          }
          next = [created, ...prev]
          setActiveId(created.id)
          targetConversation = created
        }
        if (isSupabaseConfigured && supabase) {
          const client = supabase
          const conversationForSave = targetConversation
          const conversationIdForSave = conversationForSave.id
          deletedConversationIdsRef.current.delete(conversationIdForSave)
          const previousSave = saveQueuesRef.current.get(conversationIdForSave) ?? Promise.resolve()
          const nextSave = previousSave
            .catch(() => undefined)
            .then(async () => {
              if (deletedConversationIdsRef.current.has(conversationIdForSave)) return
              const { data: authData } = await client.auth.getUser()
              const authUser = authData.user
              if (!authUser) return
              if (deletedConversationIdsRef.current.has(conversationIdForSave)) return

              const { error: conversationError } = await client.from('conversations').upsert(
                {
                  id: conversationIdForSave,
                  user_id: authUser.id,
                  title: conversationForSave.title,
                  voice_id: conversationForSave.voiceId,
                  created_at: new Date(conversationForSave.createdAt).toISOString(),
                  updated_at: new Date(conversationForSave.updatedAt).toISOString(),
                },
                { onConflict: 'id' },
              )

              if (conversationError) {
                console.error('Could not save conversation metadata.', conversationError)
                return
              }
              if (deletedConversationIdsRef.current.has(conversationIdForSave)) return

              const rows = conversationForSave.messages.map((message) => ({
                id: message.id,
                conversation_id: conversationIdForSave,
                role: message.role,
                text: message.text,
                audio_url: message.audioUrl ?? null,
                emotion: message.emotion ?? null,
                ts: message.timestamp,
                created_at: new Date(message.timestamp).toISOString(),
              }))
              if (rows.length > 0) {
                const { error: messagesError } = await client.from('messages').upsert(rows, { onConflict: 'id' })
                if (messagesError) {
                  console.error('Could not save conversation messages.', messagesError)
                }
              }
            })
          saveQueuesRef.current.set(conversationIdForSave, nextSave)
          void nextSave.finally(() => {
            if (saveQueuesRef.current.get(conversationIdForSave) === nextSave) {
              saveQueuesRef.current.delete(conversationIdForSave)
            }
          })
        }

        return next
      })
    },
    [activeId],
  )

  const loadConversation = useCallback(
    (id: string) => conversations.find((item) => item.id === id) ?? null,
    [conversations],
  )

  const deleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => {
        const next = prev.filter((item) => item.id !== id)
        return next
      })
      setActiveId((prev) => (prev === id ? null : prev))
      deletedConversationIdsRef.current.add(id)

      if (isSupabaseConfigured && supabase) {
        const client = supabase
        void client.from('conversations').delete().eq('id', id)
      }
    },
    [],
  )

  const clearConversations = useCallback(() => {
    setConversations([])
    setActiveId(null)
  }, [])

  return useMemo(
    () => ({
      conversations,
      activeId,
      setActiveId,
      saveConversation,
      loadConversation,
      deleteConversation,
      clearConversations,
    }),
    [activeId, clearConversations, conversations, deleteConversation, loadConversation, saveConversation],
  )
}
