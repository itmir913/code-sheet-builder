/* ============================================================
   3. MASK RENDERER
   ============================================================ */

const MaskRenderer = {

    /**
     * [B2 FIX] 다중 줄 마스킹 시 줄 단위로 분할하여 렌더링
     * 각 줄은 독립적으로 처리하므로 HTML 구조 붕괴 없음
     */
    render(code, masks, mode, highlightLines = []) {
        // 마스크 정렬 (시작 위치 순)
        const sortedMasks = [...masks].sort((a, b) => a.start - b.start);

        // 코드를 세그먼트로 분리
        const segments = this._buildSegments(code, sortedMasks);

        // 세그먼트를 HTML로 변환
        let html = '';
        let lineIdx = 0; // 현재 줄 인덱스 (0-based)

        for (const seg of segments) {
            if (seg.isMask) {
                // 마스크 세그먼트: 줄바꿈이 포함될 수 있으므로 줄 단위 분할
                const lines = seg.text.split('\n');
                lines.forEach((lineText, i) => {
                    const isHL = highlightLines.includes(lineIdx + 1);
                    html += this._renderMaskSpan(lineText, seg.type, mode, isHL);
                    if (i < lines.length - 1) {
                        html += '\n';
                        lineIdx++;
                    }
                });
            } else {
                // 일반 텍스트: 줄바꿈 기준으로 분리해 강조 처리
                const chars = seg.text;
                let buf = '';
                for (let ci = 0; ci < chars.length; ci++) {
                    const ch = chars[ci];
                    if (ch === '\n') {
                        const isHL = highlightLines.includes(lineIdx + 1);
                        html += (isHL ? '<span class="highlighted-line">' : '') + esc(buf) + (isHL ? '</span>' : '') + '\n';
                        buf = '';
                        lineIdx++;
                    } else {
                        buf += ch;
                    }
                }
                if (buf) {
                    const isHL = highlightLines.includes(lineIdx + 1);
                    html += (isHL ? '<span class="highlighted-line">' : '') + esc(buf) + (isHL ? '</span>' : '');
                }
            }
        }
        return html;
    },

    _buildSegments(code, masks) {
        const segs = [];
        let pos = 0;
        for (const mask of masks) {
            if (mask.start > pos) segs.push({isMask: false, text: code.slice(pos, mask.start)});
            if (mask.end > mask.start) {
                segs.push({isMask: true, text: code.slice(mask.start, mask.end), type: mask.type, id: mask.id});
            }
            pos = mask.end;
        }
        if (pos < code.length) segs.push({isMask: false, text: code.slice(pos)});
        return segs;
    },

    _renderMaskSpan(text, type, mode, isHL) {
        const hlWrap = inner => isHL ? `<span class="highlighted-line">${inner}</span>` : inner;
        if (mode === 'answer') {
            return hlWrap(`<span class="mask-answer">${esc(text)}</span>`);
        }
        const blanks = '_'.repeat(Math.max(text.replace(/\s/g, '').length || 4, 4));
        if (type === 'blank') return hlWrap(`<span class="mask-blank">${blanks}</span>`);
        if (type === 'comment') return hlWrap(`<span class="mask-comment">/* ? */</span>`);
        /* hidden */
        return hlWrap(`<span class="mask-hidden">${blanks}</span>`);
    },

    lineNumbers(code) {
        const count = (code.match(/\n/g) || []).length + 1;
        return Array.from({length: count}, (_, i) => i + 1).join('\n');
    },
};