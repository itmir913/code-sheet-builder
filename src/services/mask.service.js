/* ═══════════════════════════════════════════════════════════
   services/mask.service.js
   마스킹 오프셋 계산 및 HTML 렌더링 서비스
═══════════════════════════════════════════════════════════ */

import {esc} from '../utils/html.js';

export const MaskService = {

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
    /* ─────────────────────────────────────────────
       render(code, masks, viewMode, hlLines)
       → 모든 논리 오류가 수정된 최종 버전
    ───────────────────────────────────────────── */
    render(code, masks, viewMode = 'student', hlLines = []) {
        const sorted = [...masks].sort((a, b) => a.start - b.start);
        const segs = this._buildSegments(code, sorted);

        let html = '';
        let lineIdx = 0;
        let isNewLine = true; // 현재 줄의 시작 여부 추적

        for (const seg of segs) {
            if (seg.isMask) {
                const parts = seg.text.split('\n');
                parts.forEach((part, i) => {
                    if (i > 0) {
                        // 개행 시 이전 줄의 강조 span 닫기
                        if (hlLines.includes(lineIdx + 1)) html += '</span>';
                        html += '\n';
                        lineIdx++;
                        isNewLine = true;
                    }

                    // 새 줄의 시작에서 강조 대상이면 span 열기
                    if (isNewLine && hlLines.includes(lineIdx + 1)) {
                        html += '<span class="hl-line">';
                        isNewLine = false;
                    }

                    /* 빈 조각에는 자리표시자를 그리지 않는다. 줄 끝까지 드래그하면
                     * 마스크가 개행으로 끝나 마지막 조각이 비는데, 예전에는 거기에도
                     * '???' 를 찍어 다음 줄 맨 앞에 유령 빈칸이 생겼다. 인쇄본은
                     * 그리지 않으니 화면과 종이가 달라 보였다. 마스크 안의 빈 줄도
                     * 같다 - 채울 것이 없는 칸이다. */
                    if (part !== '') {
                        html += this._maskPartHtml(part, i, seg, viewMode);
                        isNewLine = false;
                    }
                });
            } else {
                const chars = seg.text.split('');
                for (let ci = 0; ci < chars.length; ci++) {
                    const char = chars[ci];

                    if (isNewLine && hlLines.includes(lineIdx + 1)) {
                        html += '<span class="hl-line">';
                        isNewLine = false;
                    }

                    if (char === '\n') {
                        if (hlLines.includes(lineIdx + 1)) html += '</span>';
                        html += '\n';
                        lineIdx++;
                        isNewLine = true;
                    } else {
                        html += esc(char);
                        isNewLine = false;
                    }
                }
            }
        }

        // 마지막 줄이 강조 대상이었고 태그가 열려있다면 닫기
        if (!isNewLine && hlLines.includes(lineIdx + 1)) {
            html += '</span>';
        }

        return html;
    },

    /* 마스크의 한 줄 조각(part, 줄 안에서 i 번째)을 그릴 단위로 나눈다.
     *   ws - 원문 그대로 내는 공백. 자리표시자 없이 들여쓰기를 지킨다.
     *   ph - 자리표시자로 가리는 부분.
     * 공백뿐인 조각은 통째로 ws 다. 마스크가 다음 줄의 들여쓰기에서 끝나면 그 줄에
     * '???' 가 생기고 들여쓰기가 지워졌다. 둘째 줄부터의 조각은 앞 공백도 ws 다 -
     * 여러 줄 마스크의 이어지는 줄이 0열에서 시작해 들여쓰기가 사라졌다.
     * render, mapHtmlToRaw, 인쇄(print.js) 가 모두 이 나눔을 따른다. */
    maskPartPieces(part, i) {
        if (part === '') return [];
        if (!part.trim()) return [{kind: 'ws', text: part}];
        const lead = i > 0 ? part.match(/^\s*/)[0] : '';
        return lead
            ? [{kind: 'ws', text: lead}, {kind: 'ph', text: part.slice(lead.length)}]
            : [{kind: 'ph', text: part}];
    },

    _maskPartHtml(part, i, seg, viewMode) {
        // 정답지는 원문을 그대로 보이므로 나눌 필요가 없다.
        if (viewMode === 'answer') return this._maskHtml(part, seg, viewMode);
        return this.maskPartPieces(part, i)
            .map(p => p.kind === 'ws' ? esc(p.text) : this._maskHtml(p.text, seg, viewMode))
            .join('');
    },

    _maskHtml(text, seg, viewMode) {
        if (viewMode === 'answer') {
            return `<span class="mask-answer" data-mask-id="${esc(seg.id)}">${esc(text)}</span>`;
        }

        const cls = seg.maskType === 'blank' ? 'mask-blank' : (seg.maskType === 'comment' ? 'mask-comment' : 'mask-hidden');
        const displayLabel = seg.maskType === 'blank' ? '???' : (seg.maskType === 'comment' ? '// ...' : ' ');
        return `<span class="${cls}" data-mask-id="${esc(seg.id)}">${esc(displayLabel)}</span>`;
    },

    /* pos 는 단조 증가해야 한다. 겹친 마스크가 들어오면 예전에는 pos 를 되돌려
     * 겹친 만큼 코드를 두 번 출력했다 - 'abcdef' 가 'abcdcdef' 가 됐다.
     * ADD_MASK 와 LOAD_STATE 가 겹침을 막지만, 렌더러가 그 전제 위에서 조용히
     * 코드를 지어내지 않도록 여기서도 지킨다. */
    _buildSegments(code, masks) {
        const segs = [];
        let pos = 0;
        for (const m of masks) {
            if (m.end <= pos) continue;              // 앞 마스크에 완전히 삼켜졌다
            const start = Math.max(m.start, pos);    // 겹친 앞부분은 이미 냈다
            if (start > pos) segs.push({isMask: false, text: code.slice(pos, start)});
            segs.push({isMask: true, text: code.slice(start, m.end), maskType: m.type, id: m.id});
            pos = m.end;
        }
        if (pos < code.length) segs.push({isMask: false, text: code.slice(pos)});
        return segs;
    },


    /* ─────────────────────────────────────────────
       calcSelectionOffsets(container, range)
       TreeWalker 기반 정밀 character offset 계산
    ───────────────────────────────────────────── */
    calcSelectionOffsets(container, range) {
        if (!range || !container) return null;

        // 1. 컨테이너의 시작부터 실제 선택 영역의 시작까지를 포함하는 임시 Range 생성
        const preSelectionRange = range.cloneRange();
        preSelectionRange.selectNodeContents(container);
        preSelectionRange.setEnd(range.startContainer, range.startOffset);

        // 2. 텍스트 길이를 가져옴 (브라우저가 렌더링한 기준)
        let start = preSelectionRange.toString().length;
        let end = start + range.toString().length;

        // [핵심 보정] 원본 데이터(Store.code)가 \r\n을 사용할 경우를 대비한 정규화
        // 만약 Store에 저장된 원본 코드와 DOM의 텍스트 길이가 다르다면
        // 여기서 발생하는 오차를 해결하기 위해 원본 코드도 \n으로 통일하는 것이 좋습니다.

        if (start === end) return null;
        return {start, end};
    },

    /* ─────────────────────────────────────────────
       mapHtmlToRaw(block, htmlOffsets, viewMode)
       렌더링된 HTML offset → 원본 code string offset
       마스크 placeholder 길이 차이 보정
    ───────────────────────────────────────────── */
    mapHtmlToRaw(block, htmlOffsets, viewMode = 'student') {
        const sorted = [...block.masks].sort((a, b) => a.start - b.start);
        let htmlPos = 0, rawPos = 0;
        let rawStart = -1, rawEnd = -1;

        /* 평문 구간은 화면 길이와 원본 길이가 같으므로 화면에서 잰 델타를 원본
         * 좌표에 그대로 더해도 된다. 마스크 구간은 다르다 - '???' 세 글자가
         * 원본 한 글자일 수 있어서, 같은 식을 쓰면 좌표계가 섞여 전혀 다른
         * 자리를 가리킨다. 자리표시자 안에서 시작하거나 끝난 선택은 마스크
         * 경계로 스냅한다. 그러면 기존 마스크를 통째로 덮게 되어 겹침 검사에
         * 걸리고, 사용자가 안내를 받는다. 예전에는 검사도 통과해서 경고 없이
         * 엉뚱한 자리가 뚫렸다.
         *
         * 마스크 안이지만 원문 그대로 그려지는 공백(ws)은 다르다. 화면에서는 평범한
         * 들여쓰기로 보이므로 줄 머리부터 드래그하는 일이 흔한데, 마스크 경계로
         * 스냅하면 있지도 않은 겹침 경고가 떴다. 선택의 시작은 그 공백 뒤로,
         * 끝은 그 공백 앞으로 옮겨 공백만큼 선택에서 빼낸다.
         *
         * kind: 'plain'(좌표 그대로) | 'mask'(마스크 경계로 스냅) | 'ws'(공백 건너뜀) */
        const advance = (hLen, rLen, kind = 'plain', mask = null) => {
            const nH = htmlPos + hLen;
            const nR = rawPos + rLen;

            if (rawStart === -1 && htmlOffsets.start >= htmlPos && htmlOffsets.start < nH) {
                rawStart = kind === 'mask' ? mask.start
                    : kind === 'ws' ? nR
                        : rawPos + (htmlOffsets.start - htmlPos);
            }
            if (rawEnd === -1 && htmlOffsets.end > htmlPos && htmlOffsets.end <= nH) {
                rawEnd = kind === 'mask' ? mask.end
                    : kind === 'ws' ? rawPos
                        : rawPos + (htmlOffsets.end - htmlPos);
            }
            htmlPos = nH;
            rawPos = nR;
        };

        const PLACEHOLDER_LEN = {blank: 3, comment: 6, hidden: 1};  // '???' '// ...' ' '

        let mi = 0;
        while (mi <= sorted.length) {
            const mask = sorted[mi];
            const maskRaw = mask ? mask.start : block.code.length;

            const plainLen = maskRaw - rawPos;
            if (plainLen > 0) advance(plainLen, plainLen);

            if (!mask) break;

            /* 조각은 render() 와 같은 원천에서 나눈다. mask.text 는 저장 파일에서
             * 그대로 넘어올 수 있어 코드와 어긋나기도 하고 아예 없기도 한데,
             * 그러면 자리표시자 길이 예측이 통째로 빗나가거나 여기서 죽는다. */
            const maskRawText = block.code.slice(mask.start, mask.end);

            if (viewMode === 'answer') {
                advance(maskRawText.length, maskRawText.length, 'mask', mask);
            } else {
                const phLen = PLACEHOLDER_LEN[mask.type] ?? PLACEHOLDER_LEN.hidden;
                maskRawText.split('\n').forEach((part, i) => {
                    if (i > 0) advance(1, 1, 'mask', mask);   // 조각 사이의 개행은 그대로 남는다
                    for (const p of this.maskPartPieces(part, i)) {
                        if (p.kind === 'ws') advance(p.text.length, p.text.length, 'ws');
                        else advance(phLen, p.text.length, 'mask', mask);
                    }
                });
            }
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
        // 뒤집힌 오프셋은 끝이 시작보다 앞인 Range 를 만든다.
        return masks.filter(mask => mask.start < mask.end).map(mask => {
            const startPos = model.getPositionAt(mask.start);
            const endPos = model.getPositionAt(mask.end);
            const range = new monaco.Range(
                startPos.lineNumber, startPos.column,
                endPos.lineNumber, endPos.column
            );

            let className, hoverMessage;
            if (viewMode === 'answer') {
                className = 'monaco-mask-answer';
                /* 정답은 마크다운 코드 블록에 담는다. 인라인 코드 `...` 는 정답 안의
                 * 백틱이나 줄바꿈 하나에 깨진다. 펜스는 정답에 든 가장 긴 백틱 줄보다
                 * 길게 잡는다. */
                const text = mask.text ?? '';
                const longest = Math.max(0, ...(text.match(/`+/g) || []).map(s => s.length));
                const fence = '`'.repeat(Math.max(3, longest + 1));
                hoverMessage = {value: `✅ 정답:\n\n${fence}\n${text}\n${fence}`};
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
