/* ═══════════════════════════════════════════════════════════
   ui/modal.js — 알림 / 확인 모달
═══════════════════════════════════════════════════════════ */

/* 브라우저 기본 alert/confirm 대신 쓴다. 인쇄 미리보기나 Monaco 위에서
 * 네이티브 대화상자가 뜨면 포커스가 튀고, 스타일도 앱과 따로 논다. */

/* 모달을 열기 전에 포커스가 있던 곳. 닫을 때 돌려준다 - 안 그러면 포커스가
 * 뒤의 버튼에 남아 Enter 가 모달이 아니라 그 버튼을 다시 눌렀다. */
let _returnFocus = null;

const overlay = () => document.getElementById('modal-overlay');

export const UI = {
    isOpen() {
        return overlay().style.display !== 'none';
    },

    close() {
        if (!this.isOpen()) return;
        overlay().style.display = 'none';
        const back = _returnFocus;
        _returnFocus = null;
        /* 모달을 연 버튼이 그 사이 숨었으면(가리기 팝업처럼) focus() 가 아무 일도
         * 하지 않고 포커스가 body 로 떨어진다. 보이는 요소일 때만 돌려준다. */
        if (back && document.contains(back) && back.getClientRects().length) back.focus();
    },

    modal(title, message, buttons) {
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-body').textContent = `${message}`;
        const footer = document.getElementById('modal-footer');
        footer.innerHTML = '';

        if (buttons) {
            buttons.forEach(b => {
                const btn = document.createElement('button');
                btn.className = `btn-sm ${b.cls || 'btn-sm'}`;
                btn.textContent = b.label;
                btn.addEventListener('click', () => {
                    this.close();
                    if (b.action) b.action();
                });
                footer.appendChild(btn);
            });
        } else {
            const ok = document.createElement('button');
            ok.className = 'btn-sm nav-btn-primary';
            ok.style.cssText = 'background:var(--indigo-500);border-color:var(--indigo-500);color:white;padding:6px 18px;';
            ok.textContent = '확인';
            ok.addEventListener('click', () => this.close());
            footer.appendChild(ok);
        }

        if (!this.isOpen()) _returnFocus = document.activeElement;
        overlay().style.display = 'flex';
        /* 첫 버튼에 포커스를 둔다. 확인 모달의 첫 버튼은 '취소'라서, 무심코 누른
         * Enter 가 삭제를 확정하지 않는다. */
        footer.querySelector('button')?.focus();
    },

    /* Tab 이 모달 뒤의 페이지로 빠져나가지 않게 버튼 사이에서 돈다. */
    trapFocus(e) {
        if (e.key !== 'Tab' || !this.isOpen()) return;
        const btns = [...document.querySelectorAll('#modal-footer button')];
        if (!btns.length) return;
        const i = btns.indexOf(document.activeElement);
        const next = e.shiftKey
            ? btns[(i <= 0 ? btns.length : i) - 1]
            : btns[(i + 1) % btns.length];
        e.preventDefault();
        next.focus();
    },

    confirm(message, onConfirm) {
        this.modal('확인', message, [
            {
                label: '취소', cls: 'btn-sm',
                action: null
            },
            {
                label: '확인', cls: 'btn-sm btn-sm-danger',
                action: onConfirm
            },
        ]);
    },
};
