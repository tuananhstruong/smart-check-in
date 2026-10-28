CREATE TABLE IF NOT EXISTS public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  subject text NOT NULL,
  grade_level text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  submission_date timestamptz NOT NULL DEFAULT now(),
  ai_score numeric(4,2),
  teacher_notes text,
  knowledge_gap text,
  image_url text,
  max_score numeric(6,2) NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.grading_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  file_name text, image_url text, answer_key_url text,
  max_score numeric(6,2) NOT NULL DEFAULT 10,
  score numeric(6,2), detailed_feedback text, knowledge_gaps text,
  suggested_exercises jsonb,
  assignment_name text, class_name text, student_name text, subject text, report_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.students, public.assignments, public.grading_reports TO anon, authenticated;
GRANT ALL ON public.students, public.assignments, public.grading_reports TO service_role;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grading_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shared_all_students" ON public.students FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "shared_all_assignments" ON public.assignments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "shared_all_grading_reports" ON public.grading_reports FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS assignments_student_id_idx ON public.assignments(student_id);
CREATE INDEX IF NOT EXISTS assignments_submission_date_idx ON public.assignments(submission_date DESC);
CREATE INDEX IF NOT EXISTS grading_reports_student_id_idx ON public.grading_reports(student_id);
CREATE INDEX IF NOT EXISTS grading_reports_created_at_idx ON public.grading_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS grading_reports_report_code_idx ON public.grading_reports(report_code);
CREATE INDEX IF NOT EXISTS grading_reports_class_name_idx ON public.grading_reports(class_name);
CREATE POLICY "assignments_public_read" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'assignments');
CREATE POLICY "assignments_anon_insert" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'assignments');