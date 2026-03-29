/* ═══════════════════════════════════════════════════════════
   components/preview.js — 우측 미리보기 패널
═══════════════════════════════════════════════════════════ */

'use strict';

const Preview = {
  render() {
    const root  = document.getElementById('preview-root');
    const badge = document.getElementById('preview-badge');
    if (!root) return;

    const { problems, worksheetInfo: ws, viewMode } = Store.state;

    if (badge) badge.textContent = viewMode === 'answer' ? '정답지' : '학생용';

    if (!problems.length) {
      root.innerHTML = '<div class="preview-empty">문제를 추가하면<br/>미리보기가 표시됩니다</div>';
      return;
    }

    const probsHTML = problems.map((p, i) => {
      const codeHTML = p.codeBlocks.map(b => `
        <div class="preview-code-block">
          <div class="preview-code-text">${esc(b.code.slice(0, 100))}</div>
        </div>
      `).join('');

      return `
        <div class="preview-prob">
          <div class="preview-prob-title">
            <span class="preview-prob-num">${i + 1}.</span>
            ${esc(p.title)}
          </div>
          ${p.description ? `<div style="font-size:4.5px;color:#6b7280;margin-bottom:2px;">${esc(p.description.slice(0, 60))}</div>` : ''}
          ${codeHTML}
        </div>
      `;
    }).join('');

    root.innerHTML = `
      <div class="preview-page">
        <div class="preview-page-hdr">
          <div class="preview-page-subject">${esc(ws.subject)}</div>
          <div class="preview-page-title">${esc(ws.title || '학습지')}</div>
          <div class="preview-page-meta">${esc(ws.grade)}  ${esc(ws.date)}</div>
        </div>
        <div class="preview-page-body">${probsHTML}</div>
        <div class="preview-page-footer">— ${ws.startPage || 1} —</div>
      </div>
    `;
  },
};
