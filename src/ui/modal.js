/* ═══════════════════════════════════════════════════════════
   ui/modal.js — 알림 / 확인 모달
═══════════════════════════════════════════════════════════ */

/* 브라우저 기본 alert/confirm 대신 쓴다. 인쇄 미리보기나 Monaco 위에서
 * 네이티브 대화상자가 뜨면 포커스가 튀고, 스타일도 앱과 따로 논다. */
export const UI = {
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
                    document.getElementById('modal-overlay').style.display = 'none';
                    if (b.action) b.action();
                });
                footer.appendChild(btn);
            });
        } else {
            const ok = document.createElement('button');
            ok.className = 'btn-sm nav-btn-primary';
            ok.style.cssText = 'background:var(--indigo-500);border-color:var(--indigo-500);color:white;padding:6px 18px;';
            ok.textContent = '확인';
            ok.addEventListener('click', () => {
                document.getElementById('modal-overlay').style.display = 'none';
            });
            footer.appendChild(ok);
        }

        document.getElementById('modal-overlay').style.display = 'flex';
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
