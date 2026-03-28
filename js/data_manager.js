/* ============================================================
   9. DATA MANAGER
   ============================================================ */

const DataMgr = {
    save() {
        const data = {
            version: '2.0',
            worksheetInfo: AppState.worksheetInfo,
            problems: AppState.problems,
            settings: AppState.settings,
            exportedAt: new Date().toISOString(),
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `worksheet_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    },

    load(file) {
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const data = JSON.parse(e.target.result);
                if (!data.problems) throw new Error('올바르지 않은 형식입니다.');
                AppState.worksheetInfo = {...AppState.worksheetInfo, ...data.worksheetInfo};
                AppState.problems = data.problems || [];
                AppState.settings = {...AppState.settings, ...(data.settings || {})};
                AppState.currentProblemId = AppState.problems.length > 0 ? AppState.problems[0].id : null;
                /* [B6 FIX] 카운터 복원 */
                DataMgr._restoreCounters();
                UI.syncWorksheetInfo();
                UI.syncSettings();
                UI.renderProblemList();
                UI.renderProblemEditor();
                PreviewMgr.render();
            } catch (err) {
                UI.showModal('오류', '파일을 읽을 수 없습니다: ' + err.message);
            }
        };
        reader.readAsText(file);
    },

    /* [B6 FIX] 불러온 데이터에서 카운터 최댓값 복원 */
    _restoreCounters() {
        let maxProb = 0, maxBlock = 0, maxMask = 0;
        AppState.problems.forEach(p => {
            const pn = parseInt((p.id || '').split('-')[1], 36) || 0;
            maxProb = Math.max(maxProb, pn);
            p.codeBlocks.forEach(b => {
                const bn = parseInt((b.id || '').split('-')[1], 36) || 0;
                maxBlock = Math.max(maxBlock, bn);
                b.masks.forEach(m => {
                    const mn = parseInt((m.id || '').split('-')[1], 36) || 0;
                    maxMask = Math.max(maxMask, mn);
                });
            });
        });
        _problemCounter = AppState.problems.length;
        _blockCounter = AppState.problems.reduce((s, p) => s + p.codeBlocks.length, 0);
        _maskCounter = AppState.problems.reduce((s, p) =>
            s + p.codeBlocks.reduce((s2, b) => s2 + b.masks.length, 0), 0);
    },

    reset() {
        AppState.problems = [];
        AppState.currentProblemId = null;
        AppState.worksheetInfo = {title: '새 학습지', subject: '', grade: '', date: '', startPage: 1};
        _problemCounter = 0;
        _blockCounter = 0;
        _maskCounter = 0;
        UI.syncWorksheetInfo();
        UI.renderProblemList();
        UI.renderProblemEditor();
        PreviewMgr.render();
    },
};
