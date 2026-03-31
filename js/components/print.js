/* ═══════════════════════════════════════════════════════════
   components/print.js — 인쇄 / PDF 생성
═══════════════════════════════════════════════════════════ */

'use strict';

const PrintMgr = {

    prepare() {
        const {worksheetInfo: ws, problems, settings: s, viewMode} = Store.state;

        // Set CSS custom properties for print sizing
        const root = document.documentElement;
        root.style.setProperty('--pfs', `${s.fontSize}pt`);
        root.style.setProperty('--plh', `${s.lineHeight}`);
        root.style.setProperty('--pm', `${s.margin}mm`);
        root.style.setProperty('--pal', `${Math.max(s.answerLines * 5, 5)}mm`);

        // Determine columns
        let cols = parseInt(s.layout, 10);
        if (isNaN(cols)) {
            const avgLines = problems.reduce((sum, p) =>
                    sum + p.codeBlocks.reduce((s2, b) => s2 + (b.code.match(/\n/g) || []).length + 1, 0)
                , 0) / (problems.length || 1);
            cols = avgLines > 18 ? 1 : 2;
        }

        const probsHTML = problems.map((prob, idx) => {
            const num = idx + 1;
            const blocksHTML = prob.codeBlocks.map(block => this._renderBlock(block, viewMode)).join('');

            const answerHTML = viewMode === 'answer' && prob.answer
                ? `<div class="panswer-section">
             <div class="panswer-label">정답 / 해설</div>
             <div class="panswer-text">${esc(prob.answer)}</div>
           </div>` : '';

            const answerBoxHTML = viewMode === 'student' && s.answerLines > 0
                ? `<div class="pansbox">
             <div class="pansbox-label">답안</div>
             <div class="pansbox-lines">
               ${Array.from({length: s.answerLines}, () => '<div class="pansbox-line"></div>').join('')}
             </div>
           </div>` : '';

            return `
        <div class="pprob">
          <div class="pprob-title">
            <span class="pprob-num">${num}.</span>
            <span>${esc(prob.title)}</span>
            <span class="pprob-typebadge">${TYPE_LABELS[prob.type] || ''}</span>
          </div>
          ${prob.description ? `<div class="pprob-desc">${esc(prob.description)}</div>` : ''}
          ${prob.hint ? `<div class="pprob-hint">${esc(prob.hint)}</div>` : ''}
          ${blocksHTML}
          ${answerBoxHTML}
          ${answerHTML}
        </div>
      `;
        }).join('');

        const today = ws.date || new Date().toLocaleDateString('ko-KR');

        document.getElementById('print-area').innerHTML = `
      <div class="pd">
        <div class="pp">
          <div class="ph">
            <div class="ph-top">
              <div class="ph-title">${esc(ws.title || '학습지')}</div>
              <div class="ph-meta">
                ${ws.subject ? esc(ws.subject) : ''}
                <div class="ph-mode">${viewMode === 'answer' ? '[ 정답지 ]' : '[ 학생용 ]'}</div>
              </div>
            </div>
            <div class="ph-info">
              <span>학년/반: <span class="ph-blank"></span></span>
              <span>이름: <span class="ph-blank"></span></span>
              <span>날짜: ${esc(today)}</span>
              ${ws.grade ? `<span>(${esc(ws.grade)})</span>` : ''}
            </div>
          </div>
          <div class="pb">
            <div class="cols-${cols}">${probsHTML}</div>
          </div>
        </div>
      </div>
    `.trim();
    },

    _renderBlock(block, mode) {
        const lines = block.code.split('\n');
        const sorted = [...block.masks].sort((a, b) => a.start - b.start);

        // Build per-line start offsets
        const lineStarts = [];
        let pos = 0;
        lines.forEach(line => {
            lineStarts.push(pos);
            pos += line.length + 1;
        });

        const linesHTML = lines.map((line, li) => {
            const lineStart = lineStarts[li];
            const lineEnd = lineStart + line.length;
            const lineNum = li + 1;
            const isHL = (block.highlightLines || []).includes(lineNum);

            const lineMasks = sorted
                .filter(m => m.start < lineEnd && m.end > lineStart)
                .map(m => ({
                    ...m,
                    start: Math.max(m.start, lineStart) - lineStart,
                    end: Math.min(m.end, lineEnd) - lineStart,
                }));

            const codeHTML = this._renderLineMasks(line, lineMasks, mode);

            return `
        <div class="pcl-wrap">
          <div class="pcl-num">${lineNum}</div>
          <div class="pcl-code${isHL ? ' hl' : ''}">${codeHTML}</div>
        </div>
      `;
        }).join('');

        return `
      <div class="pcb">
        ${block.title ? `<div class="pcb-title">${esc(block.title)}</div>` : ''}
        ${linesHTML}
      </div>
    `;
    },

    _renderLineMasks(line, masks, mode) {
        if (!masks.length) return esc(line) || '&nbsp;';

        let html = '', pos = 0;
        for (const m of masks) {
            if (pos < m.start) html += esc(line.slice(pos, m.start));
            const text = line.slice(m.start, m.end);

            if (mode === 'answer') {
                html += `<span class="pb-answer">${esc(text)}</span>`;
            } else {
                const bl = '_'.repeat(Math.max(text.replace(/\s/g, '').length || 4, 4));
                if (m.type === 'blank') html += `<span class="pb-blank">${bl}</span>`;
                else if (m.type === 'comment') html += `<span class="pb-comment">/* ? */</span>`;
                else html += `<span class="pb-hidden">${bl}</span>`;
            }
            pos = m.end;
        }
        if (pos < line.length) html += esc(line.slice(pos));
        return html || '&nbsp;';
    },

    print() {
        const {problems} = Store.state;
        if (!problems.length) {
            UI.modal('알림', '인쇄할 문제가 없습니다.');
            return;
        }
        this.prepare();
        window.print();
    },
};
