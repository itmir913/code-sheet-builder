/* ============================================================
   5. CODE BLOCK MANAGER
   ============================================================ */

const CodeBlockMgr = {
    add(prob) {
        if (!prob) return;
        prob.codeBlocks.push(createCodeBlock(prob.lang));
        UI.renderCodeBlocks(prob);
        PreviewMgr.render();
    },

    delete(prob, blockId) {
        if (!prob) return;
        prob.codeBlocks = prob.codeBlocks.filter(b => b.id !== blockId);
        UI.renderCodeBlocks(prob);
        PreviewMgr.render();
    },

    updateCode(prob, blockId, code) {
        const block = getBlock(prob, blockId);
        if (!block) return;
        block.code = code;
        // [B7 FIX] 코드 길이 변경 시 범위 벗어난 마스크만 제거
        block.masks = block.masks.filter(m => m.start < code.length && m.end <= code.length);
        PreviewMgr.render();
    },

    updateTitle(prob, blockId, title) {
        const block = getBlock(prob, blockId);
        if (!block) return;
        block.title = title;
        PreviewMgr.render();
    },

    updateHighlights(prob, blockId, input) {
        const block = getBlock(prob, blockId);
        if (!block) return;
        block.highlightLines = [...new Set(
            input.split(/[,\s]+/).map(s => parseInt(s, 10)).filter(n => !isNaN(n) && n > 0)
        )];
        PreviewMgr.render();
    },

    setMode(prob, blockId, mode) {
        const block = getBlock(prob, blockId);
        if (!block) return;
        block.editorMode = mode;
        UI.renderCodeBlocks(prob);
    },

    addMask(prob, blockId, start, end, type) {
        const block = getBlock(prob, blockId);
        if (!block) return;

        // 경계 클램프
        start = Math.max(0, start);
        end = Math.min(end, block.code.length);
        if (start >= end) return;

        const text = block.code.slice(start, end);
        if (!text.trim()) return;

        // 겹치는 마스크 확인
        const overlaps = block.masks.some(m => !(end <= m.start || start >= m.end));
        if (overlaps) {
            UI.showModal('알림', '선택한 영역이 이미 가려진 부분과 겹칩니다.');
            return;
        }

        block.masks.push(createMask(blockId, start, end, type, text));
        block.masks.sort((a, b) => a.start - b.start);
        UI.renderCodeBlocks(prob);
        PreviewMgr.render();
    },

    removeMask(prob, blockId, maskId) {
        const block = getBlock(prob, blockId);
        if (!block) return;
        block.masks = block.masks.filter(m => m.id !== maskId);
        UI.renderCodeBlocks(prob);
        PreviewMgr.render();
    },
};