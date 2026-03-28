/* ============================================================
   8. PRINT MANAGER — 완전 재작성
   [B1, B9 FIX] 줄 단위 렌더링, table-cell 구조, pre-wrap
   ============================================================ */

const PrintMgr = {

    prepare() {
        const ws = AppState.worksheetInfo;
        const probs = AppState.problems;
        const s = AppState.settings;
        const mode = AppState.viewMode;

        /* CSS 변수로 인쇄 설정 전달 */
        const root = document.documentElement;
        root.style.setProperty('--pfs', `${s.fontSize}pt`);
        root.style.setProperty('--plh', `${s.lineHeight}`);
        root.style.setProperty('--pm', `${s.margin}mm`);
        root.style.setProperty('--pal', `${Math.max(s.answerLines * 6, 6)}mm`);

        /* 컬럼 수 결정 */
        let cols = parseInt(s.layout, 10);
        if (isNaN(cols)) {
            const avgLines = probs.reduce((sum, p) => {
                return sum + p.codeBlocks.reduce((s2, b) => s2 + (b.code.match(/\n/g) || []).length + 1, 0);
            }, 0) / (probs.length || 1);
            cols = avgLines > 18 ? 1 : 2;
        }

        const themeClass = `theme-${s.codeTheme}`;

        /* [B1, B9 FIX] 각 문제를 줄 단위로 렌더링 */
        const problemsHTML = probs.map((prob, idx) => {
            const num = idx + 1;

            const blocksHTML = prob.codeBlocks.map(block => {
                const linesHTML = PrintMgr._renderCodeLines(block, mode);
                return `
          <div class="print-code-block ${themeClass}">
            ${block.title ? `<div class="print-code-title">${esc(block.title)}</div>` : ''}
            <div class="print-code-body">
              ${linesHTML}
            </div>
          </div>
        `;
            }).join('');

            const answerHTML = mode === 'answer' && prob.answer
                ? `<div class="print-answer-section">
             <div class="print-answer-label">정답 / 해설</div>
             <div class="print-answer-text">${esc(prob.answer)}</div>
           </div>`
                : '';

            /* 학생용: 답안 박스 추가 */
            const answerBoxHTML = mode === 'student' && prob.type !== 'output'
                ? `<div class="print-answer-box">
             <div class="print-answer-box-label">답안</div>
             <div class="print-answer-box-lines">
               ${Array.from({length: s.answerLines}, () => '<div class="print-answer-line"></div>').join('')}
             </div>
           </div>`
                : '';

            return `
        <div class="print-problem">
          <div class="print-prob-title">
            <span class="print-prob-num">${num}.</span>
            <span>${esc(prob.title)}</span>
            <span class="print-prob-type-badge">${TYPE_LABELS[prob.type] || ''}</span>
          </div>
          ${prob.description ? `<div class="print-prob-description">${esc(prob.description)}</div>` : ''}
          ${prob.hint ? `<div class="print-prob-hint">${esc(prob.hint)}</div>` : ''}
          ${blocksHTML}
          ${answerBoxHTML}
          ${answerHTML}
        </div>
      `;
        }).join('');

        const today = ws.date || new Date().toLocaleDateString('ko-KR');
        const pageNum = ws.startPage || 1;

        document.getElementById('print-area').innerHTML = `
      <div class="print-document">
        <div class="print-page">
          <div class="print-header">
            <div class="print-header-top">
              <div class="print-title">${esc(ws.title || '학습지')}</div>
              <div class="print-meta-block">
                ${ws.subject ? `<div class="print-subject">${esc(ws.subject)}</div>` : ''}
                <div style="font-size:8pt;color:#6b7280;">${mode === 'answer' ? '[ 정답지 ]' : '[ 학생용 ]'}</div>
              </div>
            </div>
            <div class="print-info-row">
              <div class="print-info-item">학년/반: <span class="print-info-blank"></span></div>
              <div class="print-info-item">이름: <span class="print-info-blank"></span></div>
              <div class="print-info-item">날짜: ${esc(today)}</div>
              ${ws.grade ? `<div class="print-info-item">(${esc(ws.grade)})</div>` : ''}
            </div>
          </div>
          <div class="print-body">
            <div class="print-columns-${cols}">${problemsHTML}</div>
          </div>
          <div class="print-page-footer">
            <span>${esc(ws.subject || '')}</span>
            <span class="print-page-num">— ${pageNum} —</span>
            <span>${mode === 'answer' ? '정답지' : ''}</span>
          </div>
        </div>
      </div>
    `;
    },

    /**
     * [B1, B9 FIX] 코드를 줄 단위로 렌더링
     * 각 줄은 <div class="print-code-line-wrap"> 로 감싸며
     * 줄 번호와 코드가 flex로 나란히 표시됨
     * break-inside:avoid 가 줄 단위로만 적용되므로
     * 긴 코드가 자연스럽게 다음 페이지로 이어짐
     */
    _renderCodeLines(block, mode) {
        const lines = block.code.split('\n');
        const sortedMasks = [...block.masks].sort((a, b) => a.start - b.start);

        /* 마스크를 줄별로 매핑 */
        const lineStarts = [];
        let pos = 0;
        lines.forEach(line => {
            lineStarts.push(pos);
            pos += line.length + 1;
        });

        return lines.map((line, li) => {
            const lineStart = lineStarts[li];
            const lineEnd = lineStart + line.length;
            const lineNum = li + 1;
            const isHL = block.highlightLines.includes(lineNum);

            /* 이 줄에 걸치는 마스크 찾기 */
            const lineMasks = sortedMasks
                .filter(m => m.start < lineEnd && m.end > lineStart)
                .map(m => ({
                    ...m,
                    // 이 줄 안에서의 상대 오프셋
                    start: Math.max(m.start, lineStart) - lineStart,
                    end: Math.min(m.end, lineEnd) - lineStart,
                }));

            const codeHTML = PrintMgr._renderLineWithMasks(line, lineMasks, mode);

            return `
        <div class="print-code-line-wrap">
          <div class="print-line-num">${lineNum}</div>
          <div class="print-code-line${isHL ? ' highlight-line' : ''}">${codeHTML}</div>
        </div>
      `;
        }).join('');
    },

    _renderLineWithMasks(line, masks, mode) {
        if (!masks.length) return esc(line) || '&nbsp;';

        let html = '';
        let pos = 0;
        for (const mask of masks) {
            if (pos < mask.start) html += esc(line.slice(pos, mask.start));

            const text = line.slice(mask.start, mask.end);
            if (mode === 'answer') {
                html += `<span class="print-answer-reveal">${esc(text)}</span>`;
            } else {
                const blanks = '_'.repeat(Math.max(text.replace(/\s/g, '').length || 4, 4));
                if (mask.type === 'blank') html += `<span class="print-blank">${blanks}</span>`;
                else if (mask.type === 'comment') html += `<span class="print-comment-mask">/* ? */</span>`;
                else html += `<span class="print-hidden-mask">${blanks}</span>`;
            }
            pos = mask.end;
        }
        if (pos < line.length) html += esc(line.slice(pos));
        return html || '&nbsp;';
    },

    print() {
        if (AppState.problems.length === 0) {
            UI.showModal('알림', '인쇄할 문제가 없습니다. 먼저 문제를 추가하세요.');
            return;
        }
        PrintMgr.prepare();
        window.print();
    },
};
