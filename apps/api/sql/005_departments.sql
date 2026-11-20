-- Department membership is informational. It never grants knowledge access.
CREATE TABLE departments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL,
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT departments_name_bounds CHECK (char_length(name) BETWEEN 3 AND 80)
);
CREATE UNIQUE INDEX departments_name_unique ON departments(lower(name));
CREATE TABLE user_departments (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 department_id uuid NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
 PRIMARY KEY (user_id,department_id)
);
CREATE INDEX user_departments_department_idx ON user_departments(department_id);
INSERT INTO departments(name) VALUES ('Tecnologia da Informação');
