/* ═══════════════════════════════════════════════════════════
   components/print.js — 인쇄 / PDF 생성
═══════════════════════════════════════════════════════════ */

import {Store, TYPE_LABELS} from '../store/state.js';
import {UI} from '../ui/modal.js';
import {esc, ownLabel} from '../utils/html.js';

export const PrintMgr = {

    prepare() {
        const {worksheetInfo: ws, problems, settings: s, viewMode} = Store.state;
        if (!problems || !problems.length) return;

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
            <span class="pprob-typebadge">${esc(ownLabel(TYPE_LABELS, prob.type))}</span>
          </div>
          ${prob.description ? `<div class="pprob-desc">${esc(prob.description).replace(/\n/g, '<br>')}</div>` : ''}
          ${prob.hint ? `<div class="pprob-hint">${esc(prob.hint)}</div>` : ''}
          ${blocksHTML}
          ${answerBoxHTML}
          ${answerHTML}
        </div>
      `;
        }).join('');

        const today = ws.date || new Date().toLocaleDateString('ko-KR');

        document.getElementById('print-area').innerHTML = `
      <div class="pd theme-${esc(s.codeTheme || 'vs')}">
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
        const totalLines = lines.length; // 전체 라인 수 확인
        const maxDigit = String(totalLines).length; // 필요한 최대 자리수 계산 (예: 100줄이면 3)

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

            // 🔥 수정 포인트: 숫자를 문자열로 바꾸고 maxDigit만큼 앞에 '0'을 채움
            const paddedLineNum = String(lineNum).padStart(maxDigit, '0');

            const isHL = (block.highlightLines || []).includes(lineNum);

            const lineMasks = sorted
                .filter(m => m.start < lineEnd && m.end > lineStart)
                .map(m => ({
                    ...m,
                    start: Math.max(m.start, lineStart) - lineStart,
                    end: Math.min(m.end, lineEnd) - lineStart,
                }))
                /* 빈 줄(lineStart === lineEnd)은 걸쳐 가는 마스크에도 걸려서
                 * 길이 0 짜리 조각이 된다. 그걸 그리면 원본에 없던 빈칸이 생겨
                 * 학생이 채울 것 없는 칸을 채우려 한다. 함수 본문 가운데의 빈 줄은
                 * 아주 흔하다. */
                .filter(m => m.end > m.start);

            const codeHTML = this._renderLineMasks(line, lineMasks, mode);

            return `
        <div class="pcl-wrap">
          <div class="pcl-num">${paddedLineNum}</div>
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
            // pos 를 되돌리면 겹친 만큼 코드를 두 번 출력한다. _buildSegments 와 같은 이유다.
            if (m.end <= pos) continue;
            const start = Math.max(m.start, pos);
            if (pos < start) html += esc(line.slice(pos, start));
            const text = line.slice(start, m.end);

            if (mode === 'answer') {
                html += `<span class="pb-answer">${esc(text)}</span>`;
            } else {
                /* 밑줄은 공백을 뺀 글자 수를 따르되 최소 4칸, 최대 24칸이다.
                 * 상한이 없으면 긴 식 하나를 가렸을 때 밑줄이 줄을 넘겨 접히고,
                 * 그러면 줄 번호와 코드가 시각적으로 어긋난다. */
                const bl = '_'.repeat(Math.min(Math.max(text.replace(/\s/g, '').length, 4), 24));
                if (m.type === 'blank') html += `<span class="pb-blank">${bl}</span>`;
                else if (m.type === 'comment') html += `<span class="pb-comment">/* ? */</span>`;
                else html += `<span class="pb-hidden">${bl}</span>`;
            }
            pos = m.end;
        }
        if (pos < line.length) html += esc(line.slice(pos));
        return html || '&nbsp;';
    },

    /* 부르기 전에 ProblemEditor.flushPending() 을 지날 것. 디바운스에 걸린
     * 코드는 아직 상태에 없어서 인쇄본에서 빠진다. 이 모듈이 직접 부르지 않는
     * 이유는 에디터를 import 하면 Monaco 가 인쇄 경로까지 따라오기 때문이다. */
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
