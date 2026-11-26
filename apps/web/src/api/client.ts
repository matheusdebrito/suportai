import type { AdminUser, CreateUserRequest, UpdateUserRequest, Department, CreateDepartmentRequest, UpdateDepartmentRequest, AssignDepartmentsRequest, GrantRequest } from '../types/admin';
import type { Space, Document, DocumentDetail, Draft, DraftDetail, Message, Conversation, PendingAction, ReviewItem, ArchivedDocument, OperationsData, SimilarArticle, DuplicatePrompt } from '../types';

const API_BASE = 'http://localhost:4000';

function getHeaders(contentType = 'application/json'): Headers {
  const headers = new Headers();
  headers.set('Content-Type', contentType);
  return headers;
}

async function handleResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({ error: 'Resposta inválida do servidor' }));
  if (!response.ok) {
    const error = new Error(data.error || 'Falha na operação') as Error & {
      code?: string;
      matches?: SimilarArticle[];
    };
    error.code = data.code;
    error.matches = data.matches;
    throw error;
  }
  return data as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    credentials: 'include',
    headers: getHeaders(),
  });
  return handleResponse<T>(response);
}

export async function apiPost<T>(path: string, body: unknown, customHeaders?: Headers): Promise<T> {
  const headers = customHeaders || getHeaders();
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: customHeaders ? body : JSON.stringify(body),
  });
  return handleResponse<T>(response);
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: getHeaders(),
    body: JSON.stringify(body),
  });
  return handleResponse<T>(response);
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    credentials: 'include',
    headers: getHeaders(),
    body: JSON.stringify(body),
  });
  return handleResponse<T>(response);
}

export async function apiDelete<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: getHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  return handleResponse<T>(response);
}

export async function apiFormData<T>(path: string, formData: FormData): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  return handleResponse<T>(response);
}

export const authApi = {
  me: () => apiGet<{ user: User }>('/auth/me'),
  login: (email: string, password: string) =>
    apiPost<{ user: User }>('/auth/login', { email, password }),
  logout: () => apiPost<{ ok: true }>('/auth/logout', {}),
  changePassword: (resetToken: string, newPassword: string) =>
    apiPost<{ ok: true }>('/auth/change-password', { resetToken, newPassword }),
};

export const spacesApi = {
  list: () => apiGet<{ spaces: Space[] }>('/spaces'),
};

export const knowledgeApi = {
  listDocuments: () => apiGet<{ documents: Document[] }>('/knowledge/documents'),
  getDocument: (id: string) => apiGet<DocumentDetail>(`/knowledge/documents/${id}`),
  getDocumentVersion: (docId: string, versionId: string) =>
    apiGet<DocumentDetail>(`/knowledge/documents/${docId}/versions/${versionId}`),
  listDrafts: () => apiGet<{ drafts: Draft[] }>('/knowledge/mine'),
  getDraft: (versionId: string) => apiGet<DraftDetail>(`/knowledge/drafts/${versionId}`),
  createArticle: (spaceId: string, title: string, content: string, duplicateReason?: string) =>
    apiPost<{ versionId: string }>('/knowledge/articles', { spaceId, title, content, duplicateReason }),
  updateArticle: (docId: string, content: string, baseVersionId: string) =>
    apiPost<{ versionId: string }>(`/knowledge/documents/${docId}/versions`, { content, baseVersionId }),
  createPdf: (spaceId: string, file: File) => {
    const form = new FormData();
    form.append('spaceId', spaceId);
    form.append('file', file);
    return apiFormData<{ versionId: string }>('/knowledge/pdfs', form);
  },
  updatePdf: (docId: string, baseVersionId: string, file: File) => {
    const form = new FormData();
    form.append('baseVersionId', baseVersionId);
    form.append('file', file);
    return apiFormData<{ versionId: string }>(`/knowledge/documents/${docId}/pdf-versions`, form);
  },
  listReviews: () => apiGet<{ reviews: ReviewItem[] }>('/knowledge/reviews'),
  listArchived: () => apiGet<{ documents: ArchivedDocument[] }>('/knowledge/archived'),
  archiveDocument: (id: string) =>
    apiPost<{ ok: true }>(`/knowledge/documents/${id}/archive`, { confirm: true }),
  restoreDocument: (id: string) =>
    apiPost<{ ok: true }>(`/knowledge/documents/${id}/restore`, { confirm: true }),
  retryVersion: (versionId: string) =>
    apiPost<{ ok: true }>(`/knowledge/versions/${versionId}/retry`, {}),
  submitReview: (versionId: string) =>
    apiPost<{ ok: true }>(`/knowledge/versions/${versionId}/submit-review`, {}),
  publishVersion: (versionId: string) =>
    apiPost<{ ok: true }>(`/knowledge/versions/${versionId}/publish`, { confirm: true }),
  requestChanges: (versionId: string, note: string) =>
    apiPost<{ ok: true }>(`/knowledge/versions/${versionId}/request-changes`, { note }),
  correctArticle: (versionId: string, content: string) =>
    apiPost<{ versionId: string }>(`/knowledge/versions/${versionId}/correct`, { content }),
  correctPdf: (versionId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return apiFormData<{ versionId: string }>(`/knowledge/versions/${versionId}/correct-pdf`, form);
  },
  rejectVersion: (versionId: string, note: string) =>
    apiPost<{ ok: true }>(`/knowledge/versions/${versionId}/reject`, { note }),
  confirmPending: (pendingId: string, duplicateReason?: string) =>
    apiPost<{ versionId: string }>(`/knowledge/pending/${pendingId}/confirm`, { duplicateReason }),
};

export const chatApi = {
  listConversations: () => apiGet<{ conversations: Conversation[] }>('/conversations'),
  createConversation: () => apiPost<{ id: string }>('/conversations', {}),
  getConversation: (id: string) =>
    apiGet<{ messages: Message[]; pendingActions: PendingAction[] }>(`/conversations/${id}`),
  deleteConversation: (id: string) =>
    apiDelete<{ ok: true }>(`/conversations/${id}`, { confirm: true }),
  sendMessage: (conversationId: string, message: string, idempotencyKey?: string) => {
    const headers = getHeaders();
    if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);
    return apiPost<{ id: string; answer: string; sources: Message['sources']; pendingActions: PendingAction[] }>(
      `/conversations/${conversationId}/messages`,
      { message },
      headers
    );
  },
  rateMessage: (messageId: string, rating: 'GOOD' | 'BAD', comment?: string) =>
    apiPost<{ ok: true; rating: 'GOOD' | 'BAD'; comment: string | null }>('/feedback', {
      messageId,
      rating,
      comment: comment ?? null,
    }),
};

export const adminApi = {
  listUsers: () => apiGet<{ users: AdminUser[] }>('/admin/users'),
  createUser: (data: CreateUserRequest) =>
    apiPost<{ id: string; resetToken: string; expiresInMinutes: number }>('/admin/users', data),
  updateUser: (id: string, data: UpdateUserRequest) =>
    apiPatch<{ ok: true }>(`/admin/users/${id}`, data),
  resetUserPassword: (id: string) =>
    apiPost<{ resetToken: string; expiresInMinutes: number }>(`/admin/users/${id}/reset-password`, {}),
  assignDepartments: (userId: string, data: AssignDepartmentsRequest) =>
    apiPut<{ ok: true }>(`/admin/users/${userId}/departments`, data),
  listDepartments: () => apiGet<{ departments: Department[] }>('/admin/departments'),
  createDepartment: (data: CreateDepartmentRequest) =>
    apiPost<{ id: string; name: string; active: boolean }>('/admin/departments', data),
  updateDepartment: (id: string, data: UpdateDepartmentRequest) =>
    apiPatch<{ id: string; name: string; active: boolean }>(`/admin/departments/${id}`, data),
  grantPermission: (spaceId: string, data: GrantRequest) =>
    apiPost<{ ok: true }>(`/admin/spaces/${spaceId}/grants`, data),
  getOperations: () => apiGet<OperationsData>('/admin/operations'),
};

type User = import('../types').User;