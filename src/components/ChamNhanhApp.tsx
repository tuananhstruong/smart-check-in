import { ChangeEvent, DragEvent, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  ChevronRight,
  ClipboardCheck,
  Crop,
  FileImage,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Minus,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { downloadGradingReport } from '@/lib/pdf';

type Student = {
  id: string;
  full_name: string;
  subject: string;
  grade_level: string;
  created_at: string;
};

type PastStudent = { studentId: string | null; name: string; className: string; subject: string };

type View = 'grading' | 'students';

type SuggestedExercise = {
  id: number;
  question: string;
  answer: string;
};

type AiStatus = 'success' | 'error';

type AiPayload = Record<string, unknown>;

const AI_WEBHOOK_URL = 'https://hook.eu1.make.com/gcu64es1ug35v1ogydcvint6jxmt0rpd';

const ASSIGNMENTS_BUCKET = 'assignments';

const SUBJECT_OPTIONS = ['Toán', 'Tiếng Anh', 'Ngữ Văn', 'Vật Lý', 'Hóa Học', 'Khác'] as const;

const SUBJECT_CODES: Record<string, string> = {
  'Toán': 'TOAN',
  'Tiếng Anh': 'ANH',
  'Ngữ Văn': 'VAN',
  'Vật Lý': 'LY',
  'Hóa Học': 'HOA',
  'Khác': 'KHAC',
};

const generateReportCode = (className: string, subject: string): string => {
  const classPart = (className || 'LOP').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6) || 'LOP';
  const subjectCode = SUBJECT_CODES[subject] || 'KHAC';
  const randomPart = String(Math.floor(100000 + Math.random() * 900000));
  return `${classPart}-${subjectCode}-${randomPart}`;
};

const extractAiPayload = (rawResult: unknown): AiPayload => {
  if (Array.isArray(rawResult)) return extractAiPayload(rawResult[0]);
  if (!rawResult || typeof rawResult !== 'object') throw new Error('Invalid AI response');
  const result = rawResult as AiPayload;
  if (result["data"] && typeof result["data"] === 'object') return result["data"] as AiPayload;
  if (result["result"] && typeof result["result"] === 'object') return result["result"] as AiPayload;
  return result;
};

const getStringValue = (payload: AiPayload, keys: string[], fallback: string): string => {
  const value = keys.map((key) => payload[key]).find((item) => typeof item === 'string' || typeof item === 'number');
  return value === undefined ? fallback : String(value);
};

const getSuggestedExercises = (payload: AiPayload): SuggestedExercise[] => {
  const rawExercises = payload["bai_tap_de_xuat"] ?? payload["suggested_exercises"] ?? payload["suggestedExercises"] ?? payload["exercises"];
  if (!Array.isArray(rawExercises)) return [];
  const exercises = rawExercises.map((item, index): SuggestedExercise | null => {
    if (typeof item === 'string') return { id: index + 1, question: item, answer: '' };
    if (!item || typeof item !== 'object') return null;
    const exercise = item as AiPayload;
    return {
      id: index + 1,
      question: getStringValue(exercise, ['cau_hoi', 'question', 'prompt', 'bai_tap'], ''),
      answer: getStringValue(exercise, ['dap_an', 'answer', 'solution'], ''),
    };
  }).filter((exercise): exercise is SuggestedExercise => Boolean(exercise?.question || exercise?.answer));
  return exercises;
};

const applyAiResult = (
  payload: AiPayload,
  setScore: (value: string) => void,
  setNotes: (value: string) => void,
  setKnowledgeGap: (value: string) => void,
  setSuggestedExercises: (value: SuggestedExercise[]) => void,
  setAiStatus: (value: AiStatus) => void,
  setSubject: (value: string) => void,
): void => {
  setScore(getStringValue(payload, ['diem', 'score', 'ai_score', 'grade'], '10'));
  setNotes(getStringValue(payload, ['nhan_xet_chi_tiet', 'nhan_xet', 'notes', 'teacher_notes', 'feedback', 'comments'], ''));
  setKnowledgeGap(getStringValue(payload, ['lo_hong_kien_thuc', 'knowledge_gap', 'knowledgeGap', 'gap'], 'Không có'));
  setSuggestedExercises(getSuggestedExercises(payload));
  const detectedSubject = getStringValue(payload, ['mon_hoc', 'subject', 'mon'], '');
  if (detectedSubject) setSubject(detectedSubject);
  const status = getStringValue(payload, ['status', 'ai_status'], 'success').toLowerCase();
  setAiStatus(status.includes('error') || status.includes('fail') || status.includes('blur') ? 'error' : 'success');
};



export function ChamNhanhApp() {
  const [view, setView] = useState<View>('grading');
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [studentsError, setStudentsError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [answerKeyFile, setAnswerKeyFile] = useState<File | null>(null);
  const [answerKeyPreviewUrl, setAnswerKeyPreviewUrl] = useState('');
  const [isAnswerKeyDragging, setIsAnswerKeyDragging] = useState(false);
  const [maxScore, setMaxScore] = useState('10');
  const [isGrading, setIsGrading] = useState(false);
  const [aiStatus, setAiStatus] = useState<AiStatus>('success');
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [toast, setToast] = useState('');
  const [submissionUrl, setSubmissionUrl] = useState<string | null>(null);
  const [storedAnswerKeyUrl, setStoredAnswerKeyUrl] = useState<string | null>(null);

  const [assignmentName, setAssignmentName] = useState('');
  const [className, setClassName] = useState('');
  const [studentName, setStudentName] = useState('');
  const [subject, setSubject] = useState<string>('Toán');
  const [reportCode, setReportCode] = useState('');

  const [score, setScore] = useState('10');
  const [notes, setNotes] = useState('');
  const [knowledgeGap, setKnowledgeGap] = useState('');
  const [isCropMode, setIsCropMode] = useState(false);
  const [suggestedExercises, setSuggestedExercises] = useState<SuggestedExercise[]>([]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 3200);
  };

  const regenerateReportCode = () => {
    setReportCode(generateReportCode(className, subject));
  };

  const selectedStudent = students.find((student) => student.id === selectedStudentId);
  const filteredStudents = useMemo(
    () => students.filter((student) => student.full_name.toLowerCase().includes(studentSearch.toLowerCase())),
    [studentSearch, students],
  );

  const [pastStudents, setPastStudents] = useState<PastStudent[]>([]);
  const loadPastStudents = async () => {
    const { data } = await supabase.from('grading_reports').select('student_id, student_name, class_name, subject, created_at').order('created_at', { ascending: false }).limit(1000);
    setPastStudents((data ?? []).filter((row) => row.student_name).map((row) => ({ studentId: row.student_id, name: row.student_name as string, className: row.class_name ?? '', subject: row.subject ?? '' })));
  };
  useEffect(() => { void loadPastStudents(); }, []);

  useEffect(() => {
    let active = true;
    const loadStudents = async () => {
      setStudentsLoading(true);
      const { data, error } = await supabase.from('students').select('id, full_name, subject, grade_level, created_at').order('created_at', { ascending: false });
      if (!active) return;
      if (error) {
        setStudentsError('Không thể tải danh sách từ máy chủ. Bạn vẫn có thể xem bản xem trước.');
        setStudents([]);
      } else {
        setStudents(data ?? []);
      }
      setStudentsLoading(false);
    };
    void loadStudents();
    return () => { active = false; };
  }, []);


  useEffect(() => {
    if (selectedStudent) {
      setStudentName(selectedStudent.full_name);
      if (selectedStudent.subject) setSubject(selectedStudent.subject);
    }
  }, [selectedStudent]);

  useEffect(() => {
    if (!reportCode) setReportCode(generateReportCode(className, subject));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportCode]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => () => {
    if (answerKeyPreviewUrl) URL.revokeObjectURL(answerKeyPreviewUrl);
  }, [answerKeyPreviewUrl]);

  const handleFile = (nextFile: File | undefined) => {
    if (!nextFile || (!nextFile.type.startsWith('image/') && nextFile.type !== 'application/pdf')) {
      setNotice('Vui lòng chọn ảnh JPG, PNG hoặc tài liệu PDF.');
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(nextFile);
    setPreviewUrl(nextFile.type.startsWith('image/') ? URL.createObjectURL(nextFile) : '');
    if (!assignmentName) setAssignmentName(nextFile.name.replace(/\.[^.]+$/, ''));
    setNotice('');
  };

  const handleAnswerKeyFile = (nextFile: File | undefined) => {
    if (!nextFile) return;
    if (!nextFile.type.startsWith('image/') && nextFile.type !== 'application/pdf') {
      setNotice('Ảnh đáp án chỉ chấp nhận JPG, PNG hoặc PDF.');
      return;
    }
    if (answerKeyPreviewUrl) URL.revokeObjectURL(answerKeyPreviewUrl);
    setAnswerKeyFile(nextFile);
    setAnswerKeyPreviewUrl(nextFile.type.startsWith('image/') ? URL.createObjectURL(nextFile) : '');
    setNotice('');
  };

  const clearAnswerKey = () => {
    if (answerKeyPreviewUrl) URL.revokeObjectURL(answerKeyPreviewUrl);
    setAnswerKeyFile(null);
    setAnswerKeyPreviewUrl('');
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => handleFile(event.target.files?.[0]);
  const onAnswerKeyChange = (event: ChangeEvent<HTMLInputElement>) => handleAnswerKeyFile(event.target.files?.[0]);
  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    handleFile(event.dataTransfer.files?.[0]);
  };
  const onAnswerKeyDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsAnswerKeyDragging(false);
    handleAnswerKeyFile(event.dataTransfer.files?.[0]);
  };

  const uploadToStorage = async (uploadFile: File, prefix: string): Promise<string> => {
    const safeName = `${prefix}-${Date.now()}-${uploadFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { error: uploadError } = await supabase.storage
      .from(ASSIGNMENTS_BUCKET)
      .upload(safeName, uploadFile, { cacheControl: '3600', upsert: false });
    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
    const { data: signed, error: signError } = await supabase.storage
      .from(ASSIGNMENTS_BUCKET)
      .createSignedUrl(safeName, 60 * 60 * 24 * 365);
    if (signError || !signed) throw new Error(`Link failed: ${signError?.message}`);
    return signed.signedUrl;
  };

  const runAiGrading = async () => {
    if (!file) {
      setNotice('Hãy tải ảnh bài tập lên trước khi chấm.');
      return;
    }
    setIsGrading(true);
    setAiStatus('success');
    setNotice('Đang tải ảnh lên...');
    try {
      const studentSubmissionUrl = await uploadToStorage(file, 'submission');
      setSubmissionUrl(studentSubmissionUrl);

      let answerKeyUrl: string | null = null;
      if (answerKeyFile) {
        answerKeyUrl = await uploadToStorage(answerKeyFile, 'answer-key');
        setStoredAnswerKeyUrl(answerKeyUrl);
      } else {
        setStoredAnswerKeyUrl(null);
      }

      const parsedMaxScore = Number(maxScore) || 10;
      const requestBody = {
        image_url: studentSubmissionUrl,
        answer_key_url: answerKeyUrl,
        max_score: parsedMaxScore,
        file_name: file.name,
      };
      setNotice('AI đang chấm bài...');
      const response = await fetch(AI_WEBHOOK_URL, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      if (!response.ok) throw new Error(`Webhook returned ${response.status}`);
      const responseText = await response.text();
      let parsedResponse: unknown = JSON.parse(responseText);
      if (typeof parsedResponse === 'string') parsedResponse = JSON.parse(parsedResponse);
      const result = extractAiPayload(parsedResponse);
      applyAiResult(result, setScore, setNotes, setKnowledgeGap, setSuggestedExercises, setAiStatus, setSubject);
      setNotice('AI đã phân tích xong. Bạn có thể duyệt và chỉnh sửa kết quả.');
    } catch (error) {
      console.error('[AI webhook] Request failed', error);
      setAiStatus('error');
      setNotice('Không thể nhận kết quả từ AI. Hãy kiểm tra webhook hoặc thử lại.');
    } finally {
      setIsGrading(false);
    }
  };

  const saveAssignment = async () => {
    if (!studentName.trim()) {
      setNotice('Hãy nhập tên học sinh trước khi lưu kết quả.');
      return;
    }
    setIsSaving(true);
    showToast('Đang lưu & xuất PDF...');
    setNotice('');
    const finalReportCode = reportCode || generateReportCode(className, subject);
    setReportCode(finalReportCode);
    const { data: insertData, error: insertError } = await supabase.from('grading_reports').insert({
      student_id: selectedStudent?.id ?? null,
      student_name: studentName || 'Học sinh',
      class_name: className || '',
      subject: subject || '',
      assignment_name: assignmentName || file?.name || '',
      report_code: finalReportCode || '',
      file_name: file?.name ?? 'bai_lam.jpg',
      image_url: submissionUrl ?? null,
      answer_key_url: storedAnswerKeyUrl ?? null,
      max_score: Number(maxScore) || 10,
      score: Number(score) || 0,
      detailed_feedback: notes || '',
      knowledge_gaps: knowledgeGap || '',
      suggested_exercises: suggestedExercises,
    }).select();
    if (insertError) {
      console.error('Lỗi lưu Supabase:', insertError);
      setIsSaving(false);
      setNotice(`Lỗi lưu vào Supabase: ${insertError.message}`);
      showToast('Lưu thất bại. Vui lòng thử lại.');
      return;
    }
    console.log('Đã lưu thành công vào Supabase:', insertData);
    void loadPastStudents();
    try {
      downloadGradingReport({
        reportCode: finalReportCode,
        assignmentName,
        fileName: file?.name ?? '',
        studentName,
        subject,
        className,
        score: Number(score) || 0,
        maxScore: Number(maxScore) || 10,
        detailedFeedback: notes,
        knowledgeGaps: knowledgeGap,
        suggestedExercises,
        imageUrl: submissionUrl,
        answerKeyUrl: storedAnswerKeyUrl,
      });
    } catch (error) {
      console.error('[PDF] export failed', error);
    }
    setIsSaving(false);
    setNotice('Đã lưu kết quả và xuất file PDF.');
    showToast('Hoàn tất!');
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><Pencil size={21} strokeWidth={2.5} /></span><span>Chấm<span>Nhanh</span></span></div>
        <div className="sidebar-label">Không gian làm việc</div>
        <nav className="nav-list">
          <button className={`nav-item ${view === 'students' ? 'active' : ''}`} onClick={() => setView('students')}><span className="nav-icon"><Users size={19} /></span><span>Danh sách học sinh</span>{view === 'students' && <ChevronRight size={16} className="nav-arrow" />}</button>
          <button className={`nav-item ${view === 'grading' ? 'active' : ''}`} onClick={() => setView('grading')}><span className="nav-icon"><ClipboardCheck size={19} /></span><span>Chấm bài mới</span>{view === 'grading' && <ChevronRight size={16} className="nav-arrow" />}</button>
        </nav>
        <div className="sidebar-bottom"><div className="help-card"><Sparkles size={18} /><div><strong>Cần trợ giúp?</strong><span>Xem hướng dẫn chấm bài</span></div></div><div className="profile-mini"><div className="avatar">LH</div><div><strong>Lê Minh Hằng</strong><span>Gia sư</span></div><LogOut size={17} /></div></div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div><div className="eyebrow"><LayoutDashboard size={14} /> Trang chủ <ChevronRight size={13} /> {view === 'grading' ? 'Chấm bài mới' : 'Học sinh'}</div><h1>{view === 'grading' ? 'Chấm bài mới' : 'Danh sách học sinh'}</h1></div><div className="topbar-right"><span className="online-dot" /> Đang hoạt động <div className="top-avatar">LH</div></div></header>
        {view === 'grading' ? <GradingView students={students} pastStudents={pastStudents} selectedStudentId={selectedStudentId} onSelectStudent={setSelectedStudentId} file={file} previewUrl={previewUrl} isDragging={isDragging} setIsDragging={setIsDragging} onDrop={onDrop} onFileChange={onFileChange} answerKeyFile={answerKeyFile} answerKeyPreviewUrl={answerKeyPreviewUrl} isAnswerKeyDragging={isAnswerKeyDragging} setIsAnswerKeyDragging={setIsAnswerKeyDragging} onAnswerKeyDrop={onAnswerKeyDrop} onAnswerKeyChange={onAnswerKeyChange} clearAnswerKey={clearAnswerKey} runAiGrading={runAiGrading} isGrading={isGrading} aiStatus={aiStatus} score={score} setScore={setScore} maxScore={maxScore} setMaxScore={setMaxScore} notes={notes} setNotes={setNotes} knowledgeGap={knowledgeGap} setKnowledgeGap={setKnowledgeGap} saveAssignment={saveAssignment} isSaving={isSaving} notice={notice} isCropMode={isCropMode} setIsCropMode={setIsCropMode} suggestedExercises={suggestedExercises} setSuggestedExercises={setSuggestedExercises} assignmentName={assignmentName} setAssignmentName={setAssignmentName} className={className} setClassName={setClassName} studentName={studentName} setStudentName={setStudentName} subject={subject} setSubject={setSubject} reportCode={reportCode} regenerateReportCode={regenerateReportCode} /> : <StudentsView students={filteredStudents} loading={studentsLoading} error={studentsError} search={studentSearch} setSearch={setStudentSearch} onGrade={(id) => { setSelectedStudentId(id); setView('grading'); }} />}
      </main>
      {toast && <div className="toast"><LoaderCircle className="spin toast-spin" size={16} /><span>{toast}</span></div>}
    </div>
  );
}

type GradingProps = {
  students: Student[]; pastStudents: PastStudent[]; selectedStudentId: string; onSelectStudent: (id: string) => void; file: File | null; previewUrl: string; isDragging: boolean; setIsDragging: (value: boolean) => void; onDrop: (event: DragEvent<HTMLLabelElement>) => void; onFileChange: (event: ChangeEvent<HTMLInputElement>) => void; answerKeyFile: File | null; answerKeyPreviewUrl: string; isAnswerKeyDragging: boolean; setIsAnswerKeyDragging: (value: boolean) => void; onAnswerKeyDrop: (event: DragEvent<HTMLLabelElement>) => void; onAnswerKeyChange: (event: ChangeEvent<HTMLInputElement>) => void; clearAnswerKey: () => void; runAiGrading: () => Promise<void>; isGrading: boolean; aiStatus: AiStatus; score: string; setScore: (value: string) => void; maxScore: string; setMaxScore: (value: string) => void; notes: string; setNotes: (value: string) => void; knowledgeGap: string; setKnowledgeGap: (value: string) => void; saveAssignment: () => void; isSaving: boolean; notice: string; isCropMode: boolean; setIsCropMode: (value: boolean) => void; suggestedExercises: SuggestedExercise[]; setSuggestedExercises: (value: SuggestedExercise[]) => void;
  assignmentName: string; setAssignmentName: (value: string) => void; className: string; setClassName: (value: string) => void; studentName: string; setStudentName: (value: string) => void; subject: string; setSubject: (value: string) => void; reportCode: string; regenerateReportCode: () => void;
};

function GradingView({ students, pastStudents, selectedStudentId, onSelectStudent, file, previewUrl, isDragging, setIsDragging, onDrop, onFileChange, answerKeyFile, answerKeyPreviewUrl, isAnswerKeyDragging, setIsAnswerKeyDragging, onAnswerKeyDrop, onAnswerKeyChange, clearAnswerKey, runAiGrading, isGrading, aiStatus, score, setScore, maxScore, setMaxScore, notes, setNotes, knowledgeGap, setKnowledgeGap, saveAssignment, isSaving, notice, isCropMode, setIsCropMode, suggestedExercises, setSuggestedExercises, assignmentName, setAssignmentName, className, setClassName, studentName, setStudentName, subject, setSubject, reportCode, regenerateReportCode }: GradingProps) {
  const updateExercise = (id: number, field: 'question' | 'answer', value: string) => setSuggestedExercises(suggestedExercises.map((exercise) => exercise.id === id ? { ...exercise, [field]: value } : exercise));
  const adjustMaxScore = (delta: number) => {
    const current = Number(maxScore) || 10;
    setMaxScore(String(Math.max(1, current + delta)));
  };
  const quickScores = [10, 20, 25, 100];
  const quickClasses = ['9A3', '10P3', '9A1', '8C2', '11A5', '12B1'];

  return <>
    <div className="page-intro split-intro"><div><h2>Duyệt kết quả chấm bài</h2><p>Kiểm tra ảnh bài làm và hoàn thiện nhận xét trước khi gửi.</p></div><div className="date-chip"><span className="online-dot" /> Bản chấm nháp</div></div>
    <div className="grading-setup card">
      <div className="setup-header"><div className="setup-title"><span className="setup-icon"><SlidersHorizontal size={16} /></span><div><span className="workspace-kicker">CẤU HÌNH CHẤM</span><h3>Thông tin lớp học & thiết lập chấm điểm</h3></div></div></div>
      <div className="setup-body setup-body-three">
        <div className="setup-section">
          <div className="setup-label"><label>Thang điểm tối đa</label><span className="setup-hint">Thang điểm chuẩn để AI quy đổi kết quả</span></div>
          <div className="max-score-control"><button type="button" className="score-step" onClick={() => adjustMaxScore(-1)} aria-label="Giảm thang điểm" disabled={isGrading}><Minus size={16} /></button><input type="number" min="1" step="1" value={maxScore} onChange={(event) => setMaxScore(event.target.value)} placeholder="10" disabled={isGrading} /><button type="button" className="score-step" onClick={() => adjustMaxScore(1)} aria-label="Tăng thang điểm" disabled={isGrading}><Plus size={16} /></button></div>
          <div className="quick-scores">{quickScores.map((s) => <button key={s} type="button" className={`quick-score ${maxScore === String(s) ? 'active' : ''}`} onClick={() => setMaxScore(String(s))} disabled={isGrading}>{s}</button>)}</div>
        </div>
        <div className="setup-section class-info-section">
          <div className="setup-label"><label>Tên bài làm</label><span className="setup-hint">Ví dụ: Kiểm tra 15 phút - Đại số</span></div>
          <input className="class-info-input" type="text" value={assignmentName} onChange={(event) => setAssignmentName(event.target.value)} placeholder="Nhập tên bài làm" disabled={isGrading} />
          <div className="class-info-grid">
            <div className="class-info-field">
              <label>Tên lớp</label>
              <input type="text" value={className} onChange={(event) => setClassName(event.target.value)} placeholder="9A3" list="class-list" disabled={isGrading} />
              <datalist id="class-list">{quickClasses.map((c) => <option key={c} value={c} />)}</datalist>
              <div className="quick-classes">{quickClasses.map((c) => <button key={c} type="button" className={`quick-class ${className === c ? 'active' : ''}`} onClick={() => setClassName(c)} disabled={isGrading}>{c}</button>)}</div>
            </div>
            <div className="class-info-field">
              <label>Môn học</label>
              <select value={subject} onChange={(event) => setSubject(event.target.value)} disabled={isGrading}>{SUBJECT_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            </div>
          </div>
          <div className="class-info-grid">
            <div className="class-info-field">
              <label>Họ và tên học sinh</label>
              <input type="text" value={studentName} onChange={(event) => setStudentName(event.target.value)} placeholder="Nhập tên học sinh" disabled={isGrading} />
            </div>
          </div>
          <div className="report-code-row">
            <div className="report-code-box">
              <span className="report-code-label">Mã báo cáo</span>
              <span className="report-code-value">{reportCode}</span>
            </div>
            <button type="button" className="report-code-refresh" onClick={regenerateReportCode} disabled={isGrading} aria-label="Tạo lại mã báo cáo"><Pencil size={13} /> Sinh mã</button>
          </div>
        </div>
        <div className="setup-section">
          <div className="setup-label"><label><KeyRound size={14} /> Ảnh đáp án / Hướng dẫn chấm</label><span className="setup-hint">Tải lên nếu có barem chấm sẵn hoặc bài nghe</span></div>
          <label className={`answer-key-stage ${isAnswerKeyDragging ? 'dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setIsAnswerKeyDragging(true); }} onDragLeave={() => setIsAnswerKeyDragging(false)} onDrop={onAnswerKeyDrop}>{answerKeyFile ? <div className="answer-key-preview">{answerKeyPreviewUrl ? <img src={answerKeyPreviewUrl} alt="Ảnh đáp án" /> : <div className="answer-key-file"><FileImage size={22} /><span>{answerKeyFile.name}</span></div>}<div className="answer-key-actions"><label className="change-image"><Upload size={13} /> Đổi<input type="file" accept="image/jpeg,image/png,application/pdf" onChange={onAnswerKeyChange} /></label><button type="button" className="clear-answer-key" onClick={clearAnswerKey}><X size={13} /> Gỡ</button></div></div> : <div className="answer-key-placeholder"><KeyRound size={28} /><strong>Tải ảnh đáp án (không bắt buộc)</strong><span>Kéo thả hoặc bấm để chọn · JPG, PNG, PDF</span><label className="change-image"><Upload size={13} /> Chọn file<input type="file" accept="image/jpeg,image/png,application/pdf" onChange={onAnswerKeyChange} /></label></div>}</label>
        </div>
      </div>
    </div>
    <div className="split-grading-layout">
      <section className="image-workspace card"><div className="workspace-header"><div><span className="workspace-kicker">BÀI LÀM ĐÃ UPLOAD</span><h3>Ảnh bài tập</h3></div><div className="image-toolbar"><label className="change-image"><Upload size={15} /> Đổi ảnh<input type="file" accept="image/jpeg,image/png,application/pdf" onChange={onFileChange} /></label><button className={`crop-button ${isCropMode ? 'selected' : ''}`} onClick={() => setIsCropMode(!isCropMode)}><Crop size={16} /> {isCropMode ? 'Đang cắt' : 'Crop / Cắt ảnh'}</button></div></div><label className={`image-stage ${isDragging ? 'dragging' : ''} ${isCropMode ? 'crop-active' : ''}`} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={onDrop}><input type="file" accept="image/jpeg,image/png,application/pdf" onChange={onFileChange} />{previewUrl ? <img src={previewUrl} alt="Ảnh bài tập đã tải lên" /> : <div className="image-placeholder"><FileImage size={48} /><strong>Kéo thả ảnh bài tập vào đây</strong><span>hoặc bấm để chọn ảnh JPG, PNG</span></div>}{isCropMode && <span className="crop-frame">Kéo các góc để cắt vùng cần chấm</span>}</label><div className="image-caption"><div className="file-status"><Check size={15} /> <span>{file ? file.name : 'Chưa có ảnh bài tập'}</span></div><span>Ảnh gốc · {file ? 'Đã nhận diện' : 'Đang chờ upload'}</span></div><button className="primary-button ai-button workspace-ai-button" onClick={runAiGrading} disabled={isGrading}>{isGrading ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}{isGrading ? 'AI đang xử lý...' : 'AI Chấm Bài'}</button><div className="student-select workspace-student"><label>Học sinh đang chấm</label><StudentCombobox students={students} pastStudents={pastStudents} className={className} studentName={studentName} subject={subject} disabled={isGrading} onPick={(option) => { setStudentName(option.name); if (option.subject) setSubject(option.subject); onSelectStudent(option.studentId ?? ''); }} onCreate={(name) => { setStudentName(name); onSelectStudent(''); }} /></div></section>
      <section className="review-panel card"><div className="review-header"><div><span className="workspace-kicker">HUMAN-IN-THE-LOOP</span><h3>Duyệt kết quả</h3><p>Giáo viên có thể chỉnh sửa mọi thông tin trước khi lưu.</p></div><span className={`ai-success-badge ${aiStatus === 'error' ? 'ai-error-badge' : ''}`}><span /> {aiStatus === 'success' ? 'AI đọc thành công' : 'Lỗi ảnh mờ'}</span></div><div className="review-scroll"><div className="review-student"><div className="student-avatar">{studentName.slice(0, 1) || '—'}</div><div><span>Học sinh</span><strong>{studentName || 'Chưa nhập tên học sinh'}</strong></div><span className="subject-tag">{subject}</span></div><div className="form-fields review-fields"><label>Trạng thái<span className={`status-badge ${aiStatus === 'error' ? 'status-error-badge' : ''}`}><Check size={13} /> {aiStatus === 'success' ? 'AI đọc thành công' : 'Lỗi ảnh mờ'}</span></label><label className="score-display-label">Điểm số<div className="score-display"><div className="score-display-row"><input type="number" min="0" max={Number(maxScore) || 10} step="0.5" value={score} onChange={(event) => setScore(event.target.value)} /><span className="score-max-display">/ {maxScore || '10'}</span></div><span className="score-hint">điểm đạt được trên {maxScore || '10'}</span></div></label><label>Lỗ hổng kiến thức<input type="text" value={knowledgeGap} onChange={(event) => setKnowledgeGap(event.target.value)} /></label><label>Nhận xét chi tiết<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={5} /></label></div><div className="suggestions"><div className="suggestions-heading"><div><h4>Bài tập đề xuất</h4><span>{suggestedExercises.length > 0 ? 'Chạm vào nội dung để chỉnh sửa trực tiếp' : 'Sẽ hiển thị khi AI chấm xong'}</span></div><BookOpen size={18} /></div>{suggestedExercises.length === 0 ? <div className="exercises-empty">Chưa có bài tập đề xuất. Nhấn "AI Chấm Bài" để AI sinh gợi ý.</div> : <div className="exercise-list">{suggestedExercises.map((exercise, index) => <div className="exercise-card" key={exercise.id}><div className="exercise-card-head"><span className="exercise-badge">Câu {index + 1}</span><Pencil size={13} className="exercise-edit-icon" /></div><input className="exercise-question-input" aria-label={`Câu hỏi bài tập ${index + 1}`} value={exercise.question} onChange={(event) => updateExercise(exercise.id, 'question', event.target.value)} placeholder="Nội dung câu hỏi" /><div className="exercise-answer-box"><span className="exercise-answer-label">Lời giải</span><input className="exercise-answer-input" aria-label={`Lời giải bài tập ${index + 1}`} value={exercise.answer} onChange={(event) => updateExercise(exercise.id, 'answer', event.target.value)} placeholder="Đáp án / gợi ý giải" /></div></div>)}</div>}</div></div><div className="review-actions"><div className="notice-area">{notice && <span className={notice.startsWith('Không') || notice.startsWith('Hãy') ? 'error-message' : 'success-message'}>{notice}</span>}</div><div className="action-buttons"><button className="reanalyze-button" onClick={runAiGrading} disabled={isGrading}>{isGrading ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}{isGrading ? 'AI đang phân tích...' : 'Yêu cầu AI phân tích lại'}</button><button className="save-button" onClick={saveAssignment} disabled={isSaving}>{isSaving ? <LoaderCircle className="spin" size={18} /> : <Check size={18} />}{isSaving ? 'Đang lưu...' : 'Lưu & Xuất PDF báo cáo'}</button></div></div></section>
    </div>
  </>;
}

type StudentsProps = { students: Student[]; loading: boolean; error: string; search: string; setSearch: (value: string) => void; onGrade: (id: string) => void };
function StudentsView({ students, loading, error, search, setSearch, onGrade }: StudentsProps) {
  return <div className="students-page"><div className="students-toolbar"><div><h2>Danh sách học sinh</h2><p>Quản lý và theo dõi tiến độ học tập của học sinh.</p></div><button className="primary-button"><Plus size={18} /> Thêm học sinh</button></div><div className="student-stats"><div><span>Tổng số học sinh</span><strong>{students.length}</strong><Users size={21} /></div><div><span>Bài đã chấm tháng này</span><strong>24</strong><ClipboardCheck size={21} /></div><div><span>Điểm trung bình</span><strong>8.2</strong><GraduationCap size={21} /></div></div><div className="student-table card"><div className="table-header"><h3>Học sinh của bạn</h3><div className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm học sinh..." /></div></div>{error && <div className="table-notice">{error}</div>}{loading ? <div className="empty-state"><LoaderCircle className="spin" size={23} /> Đang tải danh sách...</div> : students.length === 0 ? <div className="empty-state">Chưa có học sinh nào phù hợp.</div> : <div className="table-scroll"><table><thead><tr><th>Học sinh</th><th>Môn học</th><th>Khối lớp</th><th>Ngày thêm</th><th /></tr></thead><tbody>{students.map((student, index) => <tr key={student.id}><td><div className="table-student"><span className={`row-avatar avatar-${index % 4}`}>{student.full_name.slice(0, 1)}</span><strong>{student.full_name}</strong></div></td><td>{student.subject}</td><td><span className="grade-pill">{student.grade_level}</span></td><td>{new Intl.DateTimeFormat('vi-VN').format(new Date(student.created_at))}</td><td><button className="row-action" onClick={() => onGrade(student.id)}><Pencil size={15} /> Chấm bài</button></td></tr>)}</tbody></table></div>}</div></div>;
}


type ComboOption = { key: string; studentId: string | null; name: string; className: string; subject: string };

export function buildStudentOptions(students: Student[], pastStudents: PastStudent[], className: string): ComboOption[] {
  const currentClass = className.trim().toLowerCase();
  const map = new Map<string, ComboOption>();
  for (const row of pastStudents) {
    if (currentClass && row.className.trim().toLowerCase() !== currentClass) continue;
    const key = row.name.trim().toLowerCase();
    if (!map.has(key)) map.set(key, { key, studentId: row.studentId, name: row.name.trim(), className: row.className, subject: row.subject });
  }
  for (const student of students) {
    const key = student.full_name.trim().toLowerCase();
    if (!map.has(key)) map.set(key, { key, studentId: student.id, name: student.full_name, className: '', subject: student.subject });
  }
  return [...map.values()];
}

function StudentCombobox({ students, pastStudents, className, studentName, subject, disabled, onPick, onCreate }: { students: Student[]; pastStudents: PastStudent[]; className: string; studentName: string; subject: string; disabled: boolean; onPick: (option: ComboOption) => void; onCreate: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const options = useMemo(() => buildStudentOptions(students, pastStudents, className), [students, pastStudents, className]);
  const trimmed = query.trim();
  const filtered = options.filter((option) => option.name.toLowerCase().includes(trimmed.toLowerCase()));
  const exists = options.some((option) => option.name.toLowerCase() === trimmed.toLowerCase());
  const close = () => { setOpen(false); setQuery(''); };
  const create = () => { if (!trimmed) return; onCreate(trimmed); close(); };
  return (
    <div className="combo" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close(); }}>
      <button type="button" className="combo-trigger" disabled={disabled} onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="live-dot" /><span className="combo-value">{studentName || 'Chọn hoặc nhập học sinh'} · {subject || 'Môn học'}</span><ChevronRight size={16} className={`combo-chevron ${open ? 'open' : ''}`} />
      </button>
      {open && (
        <div className="combo-panel">
          <div className="combo-search"><Search size={15} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); if (filtered.length === 1 && exists) { onPick(filtered[0]!); close(); } else create(); } if (event.key === 'Escape') close(); }} placeholder="Tìm hoặc gõ tên học sinh mới..." /></div>
          <div className="combo-list">
            <span className="combo-group">{className ? `Đã chấm · Lớp ${className}` : 'Học sinh đã chấm'}</span>
            {filtered.length === 0 && <div className="combo-empty">Không tìm thấy học sinh</div>}
            {filtered.map((option) => (
              <button type="button" key={option.key} className={`combo-option ${option.name === studentName ? 'selected' : ''}`} onClick={() => { onPick(option); close(); }}>
                <span className="row-avatar combo-avatar">{option.name.slice(0, 1)}</span><span className="combo-option-text"><strong>{option.name}</strong><small>{[option.className && `Lớp ${option.className}`, option.subject].filter(Boolean).join(' · ') || 'Chưa có thông tin'}</small></span>{option.name === studentName && <Check size={15} />}
              </button>
            ))}
          </div>
          {trimmed && !exists && <button type="button" className="combo-create" onClick={create}><Plus size={15} /> Thêm mới "{trimmed}"</button>}
        </div>
      )}
    </div>
  );
}
