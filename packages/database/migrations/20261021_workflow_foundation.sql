-- Apply after scene isolation. No deployment is performed by this migration file itself.
alter table lesson_videos add column if not exists trace_id uuid not null default gen_random_uuid();
create unique index if not exists video_trace_idx on lesson_videos(trace_id);
alter table workflow_runs add column if not exists trace_id uuid;
alter table workflow_runs add column if not exists fencing_token bigint not null default 0;
alter table workflow_runs add column if not exists lease_until timestamptz;
alter table workflow_runs add column if not exists next_retry_at timestamptz;
alter table workflow_runs add column if not exists error_kind text;
alter table workflow_runs add column if not exists retry_attempt integer not null default 0;
alter table workflow_runs add column if not exists config_snapshot jsonb;
alter table workflow_runs add column if not exists config_hash text;
create table if not exists workflow_step_executions(
 id uuid primary key default gen_random_uuid(),workflow_run_id uuid not null references workflow_runs(id) on delete cascade,
 step_key text not null,input_hash text not null,fencing_token bigint not null,status text not null,
 attempt integer not null default 1,lease_until timestamptz not null,output jsonb not null default '{}',
 started_at timestamptz not null default now(),finished_at timestamptz,
 unique(workflow_run_id,step_key,input_hash)
);
create table if not exists workflow_failures(
 id uuid primary key default gen_random_uuid(),trace_id uuid,workflow_run_id uuid references workflow_runs(id) on delete cascade,
 step_key text,attempt integer not null,kind text not null,code text not null,safe_message text not null,
 disposition text not null,retry_at timestamptz,created_at timestamptz not null default now(),resolved_at timestamptz
);
create table if not exists workflow_review_queue(
 id uuid primary key default gen_random_uuid(),failure_id uuid references workflow_failures(id),trace_id uuid,
 workflow_run_id uuid references workflow_runs(id) on delete cascade,priority integer not null default 100,status text not null default 'pending',
 created_at timestamptz not null default now()
);
create table if not exists provider_circuits(
 provider_key text primary key,failure_count integer not null default 0,open_until timestamptz,
 epoch bigint not null default 0,probe_token uuid,
 probe_until timestamptz,updated_at timestamptz not null default now()
);
create index if not exists workflow_due_idx on workflow_runs(next_retry_at) where status='queued';
create index if not exists workflow_failure_trace_idx on workflow_failures(trace_id,created_at);
-- Backfill only explicit video/run associations. Reports without a video stay unassociated.
do $$ declare tbl text; begin
 foreach tbl in array array['analysis_tasks','transcript_segments','lesson_sections','classroom_events','classroom_metrics','evidence_cards','reports','workflow_step_runs'] loop
  execute format('alter table %I add column if not exists trace_id uuid',tbl);
  execute format('create index if not exists %I on %I(trace_id)',tbl||'_trace_idx',tbl);
 end loop;
end $$;
update workflow_runs w set trace_id=v.trace_id from lesson_videos v where w.video_id=v.id and w.trace_id is null;
create index if not exists workflow_trace_idx on workflow_runs(trace_id);
create or replace function propagate_video_trace() returns trigger language plpgsql as $$
declare rowdata jsonb; trace uuid; begin
 rowdata=to_jsonb(new);
 if tg_table_name='lesson_videos' then
  if tg_op='UPDATE' and new.trace_id is distinct from old.trace_id then raise exception 'video trace is immutable'; end if;
  return new;
 end if;
 if rowdata->>'video_id' is not null then select trace_id into trace from lesson_videos where id=(rowdata->>'video_id')::uuid;
 elsif rowdata->>'workflow_run_id' is not null then select trace_id into trace from workflow_runs where id=(rowdata->>'workflow_run_id')::uuid;
 elsif tg_table_name='reports' and rowdata->'generated_from'->>'videoId' is not null then
  select trace_id into trace from lesson_videos where id=(rowdata->'generated_from'->>'videoId')::uuid and lesson_id=(rowdata->>'lesson_id')::uuid;
 end if;
 if rowdata->>'video_id' is not null and rowdata->>'lesson_id' is not null and not exists(select 1 from lesson_videos where id=(rowdata->>'video_id')::uuid and lesson_id=(rowdata->>'lesson_id')::uuid) then raise exception 'video does not belong to lesson'; end if;
 if trace is not null then new.trace_id=trace; end if;
 return new;
end $$;
do $$ declare tbl text; begin
 foreach tbl in array array['lesson_videos','workflow_runs','analysis_tasks','transcript_segments','lesson_sections','classroom_events','classroom_metrics','evidence_cards','reports','workflow_step_runs'] loop
  execute format('drop trigger if exists bind_video_trace on %I',tbl);
  execute format('create trigger bind_video_trace before insert or update on %I for each row execute function propagate_video_trace()',tbl);
 end loop;
 foreach tbl in array array['analysis_tasks','transcript_segments','lesson_sections','classroom_events','classroom_metrics','evidence_cards'] loop
  execute format('update %I t set trace_id=v.trace_id from lesson_videos v where t.video_id=v.id and t.trace_id is null',tbl);
 end loop;
end $$;
update workflow_step_runs s set trace_id=w.trace_id from workflow_runs w where s.workflow_run_id=w.id and s.trace_id is null;

-- Same step execution cannot produce duplicate report records across a crash/replay.
alter table reports add column if not exists step_execution_id uuid references workflow_step_executions(id);
create unique index if not exists report_step_execution_idx on reports(step_execution_id);
create or replace function bind_report_execution() returns trigger language plpgsql as $$
begin
 if nullif(current_setting('app.execution_id',true),'') is not null then new.step_execution_id=current_setting('app.execution_id',true)::uuid; end if;
 return new;
end $$;
drop trigger if exists report_execution on reports;
create trigger report_execution before insert on reports for each row execute function bind_report_execution();

-- Legacy running tasks have no lease; make them eligible for controlled recovery.
update workflow_runs set lease_until=clock_timestamp() where status='running' and lease_until is null;
