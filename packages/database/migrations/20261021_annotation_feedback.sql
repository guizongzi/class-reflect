CREATE TABLE IF NOT EXISTS annotation_events(id uuid PRIMARY KEY,event_key text UNIQUE NOT NULL,evidence_id uuid NOT NULL,lesson_id uuid NOT NULL,action text NOT NULL,payload jsonb NOT NULL,trace_id uuid,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS sample_pool(id uuid PRIMARY KEY,evidence_id uuid UNIQUE NOT NULL,lesson_id uuid NOT NULL,source_hash text NOT NULL,scene text NOT NULL,category text NOT NULL,scene_revision integer NOT NULL,card jsonb NOT NULL,eligible boolean NOT NULL DEFAULT false,last_event_id uuid REFERENCES annotation_events(id),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS few_shot_releases(id uuid PRIMARY KEY,version text UNIQUE NOT NULL,content_hash text NOT NULL,sample_ids jsonb NOT NULL,cards jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS regression_sets(id uuid PRIMARY KEY,version text UNIQUE NOT NULL,content_hash text,frozen_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS regression_cases(id uuid PRIMARY KEY,set_id uuid NOT NULL REFERENCES regression_sets(id),source_hash text NOT NULL,payload jsonb NOT NULL);
CREATE OR REPLACE FUNCTION protect_frozen_regression() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_id uuid; frozen timestamptz;
BEGIN
 IF TG_TABLE_NAME='regression_sets' THEN
  IF OLD.frozen_at IS NOT NULL THEN RAISE EXCEPTION 'Frozen regression set is immutable'; END IF;
 ELSE
  IF TG_OP<>'INSERT' THEN
   SELECT frozen_at INTO frozen FROM regression_sets WHERE id=OLD.set_id FOR UPDATE;
   IF frozen IS NOT NULL THEN RAISE EXCEPTION 'Frozen regression cases are immutable'; END IF;
  END IF;
  IF TG_OP<>'DELETE' THEN
   SELECT frozen_at INTO frozen FROM regression_sets WHERE id=NEW.set_id FOR UPDATE;
   IF frozen IS NOT NULL THEN RAISE EXCEPTION 'Frozen regression cases are immutable'; END IF;
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER frozen_regression_parent BEFORE UPDATE OR DELETE ON regression_sets FOR EACH ROW EXECUTE FUNCTION protect_frozen_regression();
CREATE TRIGGER frozen_regression_cases BEFORE INSERT OR UPDATE OR DELETE ON regression_cases FOR EACH ROW EXECUTE FUNCTION protect_frozen_regression();
CREATE OR REPLACE FUNCTION protect_annotation_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Annotation events are immutable'; END $$;
CREATE TRIGGER immutable_annotation_events BEFORE UPDATE OR DELETE ON annotation_events FOR EACH ROW EXECUTE FUNCTION protect_annotation_event();
CREATE OR REPLACE FUNCTION protect_regression_truncate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM regression_sets WHERE frozen_at IS NOT NULL) THEN RAISE EXCEPTION 'Cannot truncate frozen regression data'; END IF; RETURN NULL;
END $$;
CREATE TRIGGER frozen_regression_parent_truncate BEFORE TRUNCATE ON regression_sets FOR EACH STATEMENT EXECUTE FUNCTION protect_regression_truncate();
CREATE TRIGGER frozen_regression_cases_truncate BEFORE TRUNCATE ON regression_cases FOR EACH STATEMENT EXECUTE FUNCTION protect_regression_truncate();
CREATE TRIGGER immutable_few_shot_releases BEFORE UPDATE OR DELETE ON few_shot_releases FOR EACH ROW EXECUTE FUNCTION protect_annotation_event();
