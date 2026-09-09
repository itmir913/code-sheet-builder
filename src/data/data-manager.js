/* ═══════════════════════════════════════════════════════════
   data/data-manager.js — 학습지 JSON 저장 / 불러오기 / 초기화
═══════════════════════════════════════════════════════════ */

import {Store} from '../store/state.js';
import {ProblemEditor} from '../components/problem-editor.js';
import {Sidebar} from '../components/sidebar.js';
import {UI} from '../ui/modal.js';

export const DataMgr = {
    save() {
        /* 에디터가 아직 디바운스를 기다리는 중이면 상태에 없는 코드가 있다.
         * 먼저 밀어 넣지 않으면 화면에는 보이는데 파일에는 없는 코드가 생긴다. */
        ProblemEditor.flushPending();

        const data = {version: '3.0', ...Store.toJSON(), exportedAt: new Date().toISOString()};
        const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `codesheet_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    },

    load(file) {
        const reader = new FileReader();
        reader.onerror = () => UI.modal('오류', '파일을 읽을 수 없습니다.');
        reader.onload = e => {
            let data;
            /* 검사를 파괴보다 먼저 한다. 예전에는 destroyAll() 로 에디터를 모두
             * 없앤 뒤에 리듀서가 터졌고, 그러면 상태는 그대로인데 화면만 죽어
             * 새로고침 전까지 코드를 볼 수도 고칠 수도 없었다. */
            try {
                data = JSON.parse(e.target.result);
                if (!Array.isArray(data.problems)) throw new Error('올바르지 않은 파일 형식입니다.');
            } catch (err) {
                UI.modal('오류', '파일을 읽을 수 없습니다: ' + err.message);
                return;
            }

            ProblemEditor.destroyAll();
            Store.dispatch({type: 'LOAD_STATE', data});

            Sidebar.syncWorksheetInfo();
            Sidebar.syncSettings();
            Sidebar.syncViewMode();
        };
        reader.readAsText(file);
    },

    reset() {
        ProblemEditor.destroyAll();
        Store.dispatch({type: 'RESET'});
        Sidebar.syncWorksheetInfo();
        Sidebar.syncSettings();
        Sidebar.syncViewMode();
    },
};
