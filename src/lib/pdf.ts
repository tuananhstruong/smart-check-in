export type ReportData = {
  reportCode: string;
  assignmentName: string;
  fileName: string;
  studentName: string;
  subject: string;
  className: string;
  score: number;
  maxScore: number;
  detailedFeedback: string;
  knowledgeGaps: string;
  suggestedExercises: { question: string; answer: string }[];
  imageUrl?: string | null;
  answerKeyUrl?: string | null;
};

const formatDate = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const escapeHtml = (text: string): string =>
  String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const downloadGradingReport = (data: ReportData): void => {
  const reportId = 'grading-report-print-root';
  const existing = document.getElementById(reportId);
  if (existing) existing.remove();

  const exercisesHtml = data.suggestedExercises.length
    ? data.suggestedExercises
        .map(
          (ex, i) => `
      <li class="exercise">
        <div class="ex-head"><span class="ex-num">Câu ${i + 1}</span><span class="ex-q">${escapeHtml(ex.question) || '—'}</span></div>
        <div class="ex-a-box"><span class="ex-a-label">Lời giải:</span> ${escapeHtml(ex.answer) || '—'}</div>
      </li>`,
        )
        .join('')
    : '<li class="exercise empty">Không có bài tập đề xuất.</li>';

  const html = `
  <div id="${reportId}">
    <div class="rp-page">
      <header class="rp-header">
        <div>
          <h1>BÁO CÁO KẾT QUẢ CHẤM BÀI TẬP</h1>
          <p>AI ASSISTANT · Chấm Nhanh</p>
        </div>
        <div class="rp-meta">
          <span>Ngày chấm: ${formatDate(new Date())}</span>
          <span>Mã: ${escapeHtml(data.reportCode) || '—'}</span>
        </div>
      </header>

      <section class="rp-overview">
        <h2>THÔNG TIN TỔNG QUAN</h2>
        <div class="rp-info">
          <div><span class="rp-label">Tên bài làm:</span> ${escapeHtml(data.assignmentName) || escapeHtml(data.fileName) || '—'}</div>
          <div><span class="rp-label">Lớp:</span> ${escapeHtml(data.className) || '—'}</div>
          <div><span class="rp-label">Học sinh:</span> ${escapeHtml(data.studentName) || '—'}</div>
          <div><span class="rp-label">Môn học:</span> ${escapeHtml(data.subject) || '—'}</div>
        </div>
        <div class="rp-score">
          <span class="rp-score-val">${data.score} / ${data.maxScore}</span>
          <span class="rp-score-hint">điểm đạt được trên thang điểm ${data.maxScore}</span>
        </div>
      </section>

      <section class="rp-section">
        <h3>Nhận xét chi tiết</h3>
        <p>${escapeHtml(data.detailedFeedback) || '—'}</p>
      </section>

      <section class="rp-section">
        <h3>Lỗ hổng kiến thức cần lưu ý</h3>
        <p>${escapeHtml(data.knowledgeGaps) || '—'}</p>
      </section>

      <section class="rp-section">
        <h3>Bài tập đề xuất kèm lời giải</h3>
        <ol class="rp-exercises">${exercisesHtml}</ol>
      </section>

      <footer class="rp-footer">
        <span>Báo cáo được tạo bởi Chấm Nhanh · AI Assistant · Mã: ${escapeHtml(data.reportCode) || '—'}</span>
      </footer>
    </div>
  </div>`;

  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);

  document.title = `Bao_cao_cham_diem_${data.fileName.replace(/\.[^.]+$/, '') || 'baclam'}`;
  window.print();

  window.setTimeout(() => {
    document.title = 'Chấm Nhanh';
    container.remove();
  }, 500);
};
