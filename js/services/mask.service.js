/* ═══════════════════════════════════════════════════════════
   services/mask.service.js
   마스킹 오프셋 계산 및 HTML 렌더링 서비스
═══════════════════════════════════════════════════════════ */

'use strict';

const MaskService = {

    /* ─────────────────────────────────────────────
       lineNumbers(code) → "1\n2\n3\n..."
    ───────────────────────────────────────────── */
    lineNumbers(code) {
        const n = (code.match(/\n/g) || []).length + 1;
        return Array.from({length: n}, (_, i) => i + 1).join('\n');
    },

    /* ─────────────────────────────────────────────
       render(code, masks, viewMode, hlLines)
       → HTML string for <pre> display
    ───────────────────────────────────────────── */
    render(code, masks, viewMode = 'student', hlLines = []) {
        const sorted = [...masks].sort((a, b) => a.start - b.start);
        const segs = this._buildSegments(code, sorted);

        let html = '';
        let lineIdx = 0;

        for (const seg of segs) {
            if (seg.isMask) {
                const parts = seg.text.split('\n');
                parts.forEach((part, i) => {
                    const hl = hlLines.includes(lineIdx + 1);
                    html += this._maskSpan(part, seg.maskType, viewMode, hl);
                    if (i < parts.length - 1) {
                        html += '\n';
                        lineIdx++;
                    }
                });
            } else {
                // Plain text — handle line by line for highlighting
                for (let ci = 0; ci < seg.text.length; ci++) {
                    const ch = seg.text[ci];
                    if (ch === '\n') {
                        const hl = hlLines.includes(lineIdx + 1);
                        if (hl) {
                            // close highlight span opened for this line's content
                            html += '</span>\n';
                        } else {
                            html += '\n';
                        }
                        lineIdx++;
                        // open highlight span for new line if needed
                        if (hlLines.includes(lineIdx + 1)) {
                            html += '<span class="hl-line">';
                        }
                    } else {
                        if ((ci === 0 && html === '') || (ci > 0 && seg.text[ci - 1] === '\n')) {
                            const hl = hlLines.includes(lineIdx + 1);
                            if (hl) html += '<span class="hl-line">';
                        }
                        html += esc(ch);
                    }
                }
            }
        }

        if (hlLines.includes(lineIdx + 1) && segs.length > 0 && !segs[segs.length - 1].isMask && !code.endsWith('\n')) {
            html += '</span>';
        }

        return html;
    },

    _buildSegments(code, masks) {
        const segs = [];
        let pos = 0;
        for (const m of masks) {
            if (m.start > pos) segs.push({isMask: false, text: code.slice(pos, m.start)});
            segs.push({isMask: true, text: code.slice(m.start, m.end), maskType: m.type, id: m.id});
            pos = m.end;
        }
        if (pos < code.length) segs.push({isMask: false, text: code.slice(pos)});
        return segs;
    },

    _maskSpan(text, type, viewMode, isHL) {
        const wrap = (inner) => isHL ? `<span class="hl-line">${inner}</span>` : inner;

        if (viewMode === 'answer') {
            return wrap(`<span class="m-answer">${esc(text)}</span>`);
        }

        const blanks = '_'.repeat(Math.max((text.replace(/\s/g, '').length) || 4, 4));
        if (type === 'blank') return wrap(`<span class="m-blank">${blanks}</span>`);
        if (type === 'comment') return wrap(`<span class="m-comment">/* ? */</span>`);
        /* hidden */
        return wrap(`<span class="m-hidden">${blanks}</span>`);
    },

    /* ─────────────────────────────────────────────
       calcSelectionOffsets(container, range)
       TreeWalker 기반 정밀 character offset 계산
    ───────────────────────────────────────────── */
    calcSelectionOffsets(container, range) {
        let startOffset = -1, endOffset = -1, charCount = 0;
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);

        while (walker.nextNode()) {
            const node = walker.currentNode;
            const len = node.textContent.length;

            if (node === range.startContainer && node === range.endContainer) {
                startOffset = charCount + range.startOffset;
                endOffset = charCount + range.endOffset;
                break;
            }
            if (startOffset === -1 && node === range.startContainer) {
                startOffset = charCount + range.startOffset;
            }
            if (endOffset === -1 && node === range.endContainer) {
                endOffset = charCount + range.endOffset;
                break;
            }
            charCount += len;
        }

        if (startOffset === -1 || endOffset === -1) return null;
        const s = Math.min(startOffset, endOffset);
        const e = Math.max(startOffset, endOffset);
        if (s === e) return null;
        return {start: s, end: e};
    },

    /* ─────────────────────────────────────────────
       mapHtmlToRaw(block, htmlOffsets, viewMode)
       렌더링된 HTML offset → 원본 code string offset
       마스크 placeholder 길이 차이 보정
    ───────────────────────────────────────────── */
    mapHtmlToRaw(block, htmlOffsets, viewMode = 'student') {
        if (!block.masks.length) return htmlOffsets;

        const sorted = [...block.masks].sort((a, b) => a.start - b.start);
        let htmlPos = 0, rawPos = 0;
        let rawStart = -1, rawEnd = -1;

        const advance = (hLen, rLen) => {
            const nH = htmlPos + hLen;
            const nR = rawPos + rLen;

            if (rawStart === -1 && htmlOffsets.start >= htmlPos && htmlOffsets.start < nH) {
                rawStart = rawPos + (htmlOffsets.start - htmlPos);
            }
            if (rawEnd === -1 && htmlOffsets.end > htmlPos && htmlOffsets.end <= nH) {
                rawEnd = rawPos + (htmlOffsets.end - htmlPos);
            }
            htmlPos = nH;
            rawPos = nR;
        };

        let mi = 0;
        while (mi <= sorted.length) {
            const mask = sorted[mi];
            const maskRaw = mask ? mask.start : block.code.length;

            const plainLen = maskRaw - rawPos;
            if (plainLen > 0) advance(plainLen, plainLen);

            if (!mask) break;

            const maskRawLen = mask.end - mask.start;
            let maskHtmlLen;
            if (viewMode === 'answer') {
                maskHtmlLen = maskRawLen;
            } else if (mask.type === 'comment') {
                maskHtmlLen = 7;
            } else {
                maskHtmlLen = Math.max((mask.text.replace(/\s/g, '').length) || 4, 4);
            }

            advance(maskHtmlLen, maskRawLen);
            mi++;
        }

        if (rawStart === -1) rawStart = rawPos;
        if (rawEnd === -1) rawEnd = rawPos;

        rawStart = Math.max(0, Math.min(rawStart, block.code.length));
        rawEnd = Math.max(0, Math.min(rawEnd, block.code.length));

        if (rawStart >= rawEnd) return null;
        return {start: rawStart, end: rawEnd};
    },

    /* ─────────────────────────────────────────────
       Monaco decorations for mask visualization
    ───────────────────────────────────────────── */
    getMaskDecorations(monaco, model, masks, viewMode = 'student') {
        return masks.map(mask => {
            const startPos = model.getPositionAt(mask.start);
            const endPos = model.getPositionAt(mask.end);
            const range = new monaco.Range(
                startPos.lineNumber, startPos.column,
                endPos.lineNumber, endPos.column
            );

            let className, hoverMessage;
            if (viewMode === 'answer') {
                className = 'monaco-mask-answer';
                hoverMessage = {value: `✅ 정답: \`${mask.text}\``};
            } else if (mask.type === 'blank') {
                className = 'monaco-mask-blank';
                hoverMessage = {value: '📝 빈칸 (blank)'};
            } else if (mask.type === 'comment') {
                className = 'monaco-mask-comment';
                hoverMessage = {value: '💬 주석 숨김 (comment)'};
            } else {
                className = 'monaco-mask-hidden';
                hoverMessage = {value: '⬛ 숨김 (hidden)'};
            }

            return {
                range,
                options: {
                    inlineClassName: className,
                    hoverMessage,
                    stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
                },
            };
        });
    },
};
