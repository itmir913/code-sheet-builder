/* ============================================================
   4. PROBLEM MANAGER
   ============================================================ */

const ProblemMgr = {
    add() {
        const prob = createProblem();
        prob.codeBlocks.push(createCodeBlock(prob.lang));
        AppState.problems.push(prob);
        UI.renderProblemList();
        this.select(prob.id);
        PreviewMgr.render();
    },

    select(id) {
        AppState.currentProblemId = id;
        UI.renderProblemList();
        UI.renderProblemEditor();
    },

    delete(id) {
        const idx = AppState.problems.findIndex(p => p.id === id);
        if (idx === -1) return;
        AppState.problems.splice(idx, 1);
        if (AppState.currentProblemId === id) {
            AppState.currentProblemId = AppState.problems.length > 0
                ? AppState.problems[Math.max(0, idx - 1)].id
                : null;
        }
        UI.renderProblemList();
        UI.renderProblemEditor();
        PreviewMgr.render();
    },

    duplicate(id) {
        const prob = getProblem(id);
        if (!prob) return;
        const copy = JSON.parse(JSON.stringify(prob));
        copy.id = newId('prob');
        copy.title = prob.title + ' (복사)';
        copy.codeBlocks = copy.codeBlocks.map(b => {
            b.id = newId('block');
            b.masks = b.masks.map(m => ({...m, id: newId('mask')}));
            return b;
        });
        const idx = AppState.problems.findIndex(p => p.id === id);
        AppState.problems.splice(idx + 1, 0, copy);
        UI.renderProblemList();
        this.select(copy.id);
    },

    updateField(field, value) {
        const prob = currentProb();
        if (!prob) return;
        prob[field] = value;
        if (field === 'lang') {
            prob.codeBlocks.forEach(b => {
                b.lang = value;
            });
            UI.renderCodeBlocks(prob);
        }
        if (field === 'title' || field === 'type') UI.renderProblemList();
        PreviewMgr.render();
    },
};