-- Introduce review comments without overwriting any existing content.
ALTER TABLE document_versions DROP CONSTRAINT document_versions_status_check;
ALTER TABLE document_versions ADD CONSTRAINT document_versions_status_check
  CHECK(status IN ('DRAFT','IN_REVIEW','CHANGES_REQUESTED','PUBLISHED','REJECTED','ARCHIVED'));
ALTER TABLE document_versions ADD COLUMN review_note text;
ALTER TABLE document_versions ADD CONSTRAINT document_versions_review_note_limit
  CHECK(review_note IS NULL OR char_length(review_note)<=2000);
ALTER TABLE document_versions ADD COLUMN superseded_by uuid REFERENCES document_versions(id);
CREATE INDEX document_versions_superseded_by_idx ON document_versions(superseded_by);
