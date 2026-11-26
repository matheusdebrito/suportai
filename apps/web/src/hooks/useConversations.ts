import { useCallback } from 'react';
import { useApi } from './useApi';
import { chatApi } from '../api/client';
import type { Conversation, Message, PendingAction } from '../types';

export function useConversations() {
  const { data, loading, error, execute: fetchConversations, reset } = useApi(chatApi.listConversations);

  return {
    conversations: data?.conversations ?? [],
    loading,
    error,
    fetchConversations,
    reset,
  };
}

export function useConversation(id: string | null) {
  const { data, loading, error, execute: fetchConversation, reset } = useApi(
    useCallback(() => (id ? chatApi.getConversation(id) : Promise.resolve({ messages: [], pendingActions: [] })), [id])
  );

  return {
    messages: data?.messages ?? [],
    pendingActions: data?.pendingActions ?? [],
    loading,
    error,
    fetchConversation,
    reset,
  };
}

export function useChatActions() {
  const createConversation = useApi(chatApi.createConversation);
  const deleteConversation = useApi(chatApi.deleteConversation);
  const sendMessage = useApi(chatApi.sendMessage);
  const rateMessage = useApi(chatApi.rateMessage);

  return {
    createConversation,
    deleteConversation,
    sendMessage,
    rateMessage,
  };
}