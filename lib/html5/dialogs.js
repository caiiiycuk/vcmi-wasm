const getFileNameOnly = (value) => {
    if (!value) {
        return '';
    }
    const normalized = String(value);
    const separatorIndex = normalized.lastIndexOf('/');
    return separatorIndex >= 0 ? normalized.slice(separatorIndex + 1) : normalized;
};

function createFsSyncProgress() {
    const style = document.createElement('style');
    style.textContent = `
        .fs-sync-overlay {
            position: fixed;
            inset: 0;
            z-index: 2147483647;
            display: none;
            align-items: center;
            justify-content: center;
            padding: 24px;
            box-sizing: border-box;
            background: rgba(10, 14, 22, 0.62);
            backdrop-filter: blur(8px);
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            color: #eef3ff;
        }

        .fs-sync-dialog {
            width: min(460px, 100%);
            padding: 26px;
            box-sizing: border-box;
            border: 1px solid rgba(255, 255, 255, 0.14);
            border-radius: 8px;
            background:
                linear-gradient(135deg, rgba(34, 44, 62, 0.96), rgba(17, 23, 34, 0.98)),
                #172030;
            box-shadow: 0 24px 80px rgba(0, 0, 0, 0.42);
        }

        .fs-sync-heading {
            margin: 0;
            font-size: 20px;
            font-weight: 700;
            line-height: 1.25;
        }

        .fs-sync-header-row {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 16px;
            margin-bottom: 6px;
        }

        .fs-sync-message {
            margin: 0;
            margin-bottom: 18px;
            color: #aebad0;
            font-size: 14px;
            line-height: 1.4;
        }

        .fs-sync-percent {
            min-width: 48px;
            text-align: right;
            font-variant-numeric: tabular-nums;
            font-weight: 700;
        }

        .fs-sync-track {
            position: relative;
            height: 12px;
            overflow: hidden;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.11);
        }

        .fs-sync-bar {
            width: 0%;
            height: 100%;
            border-radius: inherit;
            background: linear-gradient(90deg, #5dd7a8, #5ca8ff);
            box-shadow: 0 0 24px rgba(92, 168, 255, 0.34);
            transition: width 160ms ease-out;
        }

        .fs-sync-file {
            margin-top: 14px;
            color: #8f9bb2;
            font-size: 12px;
            line-height: 1.35;
            min-height: 1.35em;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
    `;

    const overlay = document.createElement('div');
    overlay.className = 'fs-sync-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const dialog = document.createElement('div');
    dialog.className = 'fs-sync-dialog';

    const heading = document.createElement('h2');
    heading.className = 'fs-sync-heading';
    heading.textContent = 'Synchronizing files';

    const headerRow = document.createElement('div');
    headerRow.className = 'fs-sync-header-row';

    const message = document.createElement('p');
    message.className = 'fs-sync-message';
    message.textContent = 'Please wait while filesystem changes are being saved.';

    const percent = document.createElement('span');
    percent.className = 'fs-sync-percent';
    percent.textContent = '0%';

    const track = document.createElement('div');
    track.className = 'fs-sync-track';

    const bar = document.createElement('div');
    bar.className = 'fs-sync-bar';

    const fileName = document.createElement('div');
    fileName.className = 'fs-sync-file';
    fileName.textContent = ' ';

    headerRow.append(heading, percent);
    track.append(bar);
    dialog.append(headerRow, message, track, fileName);
    overlay.append(dialog);
    document.head.append(style);
    document.body.append(overlay);

    const setProgress = (value) => {
        const clamped = Math.max(0, Math.min(100, Number(value) || 0));
        percent.textContent = `${clamped}%`;
        bar.style.width = `${clamped}%`;
    };
    
    let isSyncActive = false;
    let showTimer = null;
    return {
        begin() {
            isSyncActive = true;
            setProgress(0);
            message.textContent = 'Collecting changes';
            fileName.textContent = ' ';
            overlay.style.display = 'none';
            if (showTimer !== null) {
                window.clearTimeout(showTimer);
            }
            showTimer = window.setTimeout(() => {
                showTimer = null;
                if (isSyncActive) {
                    overlay.style.display = 'flex';
                }
            }, 1000);
        },
        update(progress, type, file) {
            setProgress(progress);
            message.textContent = type !== 'local'
                ? 'Flushing data to disk'
                : 'Mounting file system';
            fileName.textContent = file ? getFileNameOnly(file) : ' ';
        },
        finish() {
            isSyncActive = false;
            if (showTimer !== null) {
                window.clearTimeout(showTimer);
                showTimer = null;
            }
            setProgress(100);
            fileName.textContent = ' ';
            overlay.style.display = 'none';
        }
    };
}

globalThis.fsSyncProgress = createFsSyncProgress();