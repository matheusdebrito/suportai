ALTER TABLE investigations ADD COLUMN support_preference text NOT NULL DEFAULT 'adaptive' CHECK (support_preference IN ('adaptive','guided','complete'));
