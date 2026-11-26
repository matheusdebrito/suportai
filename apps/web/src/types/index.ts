export type UserRole = 'ADMIN' | 'APPROVER' | 'USER';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  must_change_password: boolean;
  active: boolean;
  auth_revision: number;
  department_ids?: string[];
}

export interface Space {
  id: string;
  name: string;
  visibility: 'SHARED' | 'RESTRICTED';
  can_read: boolean;
  can_edit: boolean;
  can_approve: boolean;
}

export interface Document {
  id: string;
  title: string;
  kind: 'ARTICLE' | 'PDF';
  space_name: string;
  space_id: string;
  current_version_id?: string;
  archived_at?: string;
}

export interface DocumentVersion {
  id: string;
  document_id: string;
  version_number: number;
  status: 'DRAFT' | 'IN_REVIEW' | 'CHANGES_REQUESTED' | 'REJECTED' | 'PUBLISHED' | 'ARCHIVED';
  index_status: 'READY' | 'PENDING' | 'FAILED';
  content: string;
  pdf_bytes?: ArrayBuffer;
  authored_by: string;
  base_version_id?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  review_note?: string;
  superseded_by?: string;
  created_at: string;
}

export interface DocumentDetail extends Document {
  is_current?: boolean;
  version: {
    id: string;
    content: string;
    version_number: number;
    status: string;
  };
}

export interface Draft {
  version_id: string;
  document_id: string;
  title: string;
  kind: 'ARTICLE' | 'PDF';
  version_number: number;
  status: 'DRAFT' | 'IN_REVIEW' | 'CHANGES_REQUESTED' | 'REJECTED';
  index_status: 'READY' | 'PENDING' | 'FAILED';
  space_name: string;
  space_id: string;
  ingestion_error?: string;
  review_note?: string;
  authored_by: string;
  created_at: string;
}

export interface DraftDetail extends Draft {
  content: string;
}

export interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  feedback_rating?: 'GOOD' | 'BAD' | null;
  feedback_comment?: string | null;
  investigation_id?: string;
  created_at?: string;
}

export interface Source {
  document_id: string;
  version_id: string;
  version_number?: number;
  title: string;
  ordinal: number;
  historical?: boolean;
  excerpts?: string[];
}

export interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}

export interface PendingAction {
  id: string;
  title: string;
  content: string;
  space_name?: string;
  document_id?: string;
  before_content?: string;
}

export interface SimilarArticle {
  id: string;
  title: string;
  kind: 'ARTICLE' | 'PDF';
}

export interface ReviewItem {
  version_id: string;
  document_id: string;
  title: string;
  space_name: string;
  status: string;
  index_status: string;
  content: string;
  base_content?: string | null;
  ingestion_error?: string;
}

export interface ArchivedDocument {
  id: string;
  title: string;
  kind: 'ARTICLE' | 'PDF';
  space_name: string;
  archived_at: string;
  current_version_id: string;
}

export interface OperationsData {
  observed_at: string;
  external_ai_enabled: boolean;
  ingestion: {
    pending: number;
    running: number;
    completed: number;
    failed: number;
    stalled: number;
    last_completed_at: string | null;
  };
  knowledge: {
    published: number;
    archived: number;
  };
  conversation: {
    questions_7d: number;
    answers_7d: number;
  };
  feedback: {
    good_7d: number;
    bad_7d: number;
  };
}

export * from './admin';