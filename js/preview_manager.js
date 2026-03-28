/* ============================================================
   7. PREVIEW MANAGER
   ============================================================ */

const PreviewMgr = {
    render() {
        const container = document.getElementById('preview-container');
        if (!container) return;

        const probs = AppState.problems;
        if (probs.length === 0) {
            container.innerHTML = '<div class="preview-empty"><p>문제를 추가하면<br>여기에 미리보기가 표시됩니다</p></div>';
            document.getElementById('preview-mode-badge').textContent = AppState.viewMode === 'answer' ? '정답지' : '학생용';
            return;
        }

        const ws = AppState.worksheetInfo;
        const title = ws.title || '학습지';
        const grade = ws.grade || '';
        const date = ws.date || '';

        const probsHTML = probs.map((prob, idx) => {
            const codePreview = prob.codeBlocks.map(b =>
                `<div class="preview-code-block"><div class="preview-code-text">${esc(b.code.slice(0, 120))}</div></div>`
            ).join('');

            return `
        <div class="preview-problem">
          <div class="preview-prob-title">
            <span class="preview-prob-num">${idx + 1}.</span>
            ${esc(prob.title)}
          </div>
          ${prob.description ? `<div class="preview-prob-desc">${esc(prob.description.slice(0, 70))}</div>` : ''}
          ${codePreview}
        </div>
      `;
        }).join('');

        container.innerHTML = `
      <div class="preview-page">
        <div class="preview-page-header">
          <div class="preview-page-school">${esc(ws.subject)}</div>
          <div class="preview-page-title">${esc(title)}</div>
          <div class="preview-page-meta"><span>${esc(grade)}</span><span>${esc(date)}</span></div>
        </div>
        <div class="preview-page-body">${probsHTML}</div>
        <div class="preview-page-footer">— ${ws.startPage || 1} —</div>
      </div>
    `;

        document.getElementById('preview-mode-badge').textContent =
            AppState.viewMode === 'answer' ? '정답지' : '학생용';
    },
};
