alter table lessons drop constraint if exists lessons_lesson_format_check;
alter table lessons add constraint lessons_lesson_format_check
  check (lesson_format in (
    'offline_classroom_recording',
    'live_online_class',
    'recorded_online_class',
    'teacher_certification_interview',
    'teacher_qualification_demo'
  ));
