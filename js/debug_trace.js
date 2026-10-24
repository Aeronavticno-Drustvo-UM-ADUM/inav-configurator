const MAX_LINES = 5000;
const SESSION_MARK = '===== Session started';

/**
 * Fills a popup window with the debug trace view. Runs in the opener's realm because a
 * packaged build has no tabs/debug_trace.html or js file for the popup to load by URL.
 * @param {Window} win popup whose document already holds tabs/debug_trace.html
 * @param {object} api debugLogging module
 * @param {function(): string} getText returns the trace text
 * @param {function(): void} clearText empties the trace
 */
export default function initDebugTrace(win, api, getText, clearText) {
    const doc = win.document;
    const output = doc.getElementById('debug-trace');
    const state = doc.getElementById('trace-state');
    let lastText = null;

    function msg(key, fallback) {
        return api.msg(key) || fallback;
    }

    function render(text) {
        let lines = text.split('\n');
        if (lines.length > MAX_LINES) {
            lines = lines.slice(-MAX_LINES);
        }
        const fragment = doc.createDocumentFragment();
        let shown = 0;
        lines.forEach(function(line) {
            if (line === '') {
                return;
            }
            const el = doc.createElement('div');
            el.className = line.indexOf(SESSION_MARK) === 0 ? 'session' : 'line';
            el.textContent = line;
            fragment.appendChild(el);
            shown++;
        });
        if (shown === 0) {
            const empty = doc.createElement('div');
            empty.className = 'empty';
            empty.textContent = msg('debugLogWaiting', 'Waiting for debug messages from the flight controller...');
            fragment.appendChild(empty);
        }
        output.replaceChildren(fragment);
        state.textContent = shown + ' ' + msg('debugLogLines', 'lines');
    }

    doc.getElementById('trace-clear').addEventListener('click', clearText);

    // Reopening reuses the window, so drop the timer of the previous view
    win.clearInterval(win.debugTraceTimer);
    win.debugTraceTimer = win.setInterval(function() {
        const text = getText();
        if (text === lastText) {
            return;
        }
        lastText = text;

        // Keep following the output unless the user scrolled up to read it
        const atBottom = output.scrollHeight - output.scrollTop - output.clientHeight < 20;
        render(text);
        if (atBottom) {
            output.scrollTop = output.scrollHeight;
        }
    }, 100);

    setupLogSettings(win, api, msg);
}

function setupLogSettings(win, api, msg) {
    const doc = win.document;
    const settingsEl = doc.getElementById('log-settings');
    const note = doc.getElementById('log-note');
    const optionsEl = doc.getElementById('log-options');
    const levelEl = doc.getElementById('log-level');
    const topicsButton = doc.getElementById('topics-button');
    const topicsPanel = doc.getElementById('topics-panel');
    const saveButton = doc.getElementById('log-save');
    const enabledRadios = doc.querySelectorAll('input[name=log-enabled]');

    doc.querySelectorAll('[data-msg]').forEach(function(el) {
        const text = api.msg(el.getAttribute('data-msg'));
        if (text) {
            el.textContent = text;
        }
    });

    function setNote(text, isError) {
        note.textContent = text;
        note.classList.toggle('error', !!isError);
    }

    const topicBoxes = api.TOPICS.map(function(name, bit) {
        const label = doc.createElement('label');
        const box = doc.createElement('input');
        box.type = 'checkbox';
        box.value = String(bit);
        box.addEventListener('change', updateTopicsLabel);
        label.appendChild(box);
        label.appendChild(doc.createTextNode(name));
        topicsPanel.appendChild(label);
        return box;
    });

    api.LEVELS.forEach(function(name, index) {
        const option = doc.createElement('option');
        option.value = String(index);
        option.textContent = name;
        levelEl.appendChild(option);
    });

    function topicMask() {
        return topicBoxes.reduce(function(mask, box) {
            return box.checked ? (mask | (1 << Number(box.value))) >>> 0 : mask;
        }, 0);
    }

    function updateTopicsLabel() {
        const count = topicBoxes.filter(function(box) { return box.checked; }).length;
        topicsButton.textContent = (count ? count + ' / ' + topicBoxes.length : msg('debugLogTopicsNone', 'None')) + ' \u25BE';
    }

    function loggingOn() {
        return doc.getElementById('log-on').checked;
    }

    function updateOptionsState() {
        optionsEl.classList.toggle('disabled', !loggingOn());
        topicsPanel.classList.remove('open');
    }

    topicsButton.addEventListener('click', function(event) {
        event.stopPropagation();
        topicsPanel.classList.toggle('open');
    });
    doc.addEventListener('click', function(event) {
        if (!topicsPanel.contains(event.target)) {
            topicsPanel.classList.remove('open');
        }
    });
    enabledRadios.forEach(function(radio) {
        radio.addEventListener('change', updateOptionsState);
    });

    api.load(function(current) {
        if (!current.supported) {
            settingsEl.classList.add('disabled');
            setNote(msg('debugLogUnsupported', 'This board does not support logging over MSP'), true);
            return;
        }
        doc.getElementById(current.enabled ? 'log-on' : 'log-off').checked = true;
        levelEl.value = String(current.level);
        topicBoxes.forEach(function(box) {
            box.checked = (current.topics & (1 << Number(box.value))) !== 0;
        });
        updateTopicsLabel();
        updateOptionsState();
        setNote(msg('debugLogPort', 'Log port') + ': ' + current.portName + '. ' + msg('debugLogRebootNote', 'Saving writes to the board and reboots it. Logging can reduce performance.'));
    });

    saveButton.addEventListener('click', function() {
        if (!win.confirm(msg('debugLogConfirm', 'Save the logging settings and reboot the board?'))) {
            return;
        }
        saveButton.disabled = true;
        setNote(msg('debugLogSaving', 'Saving, the board will reboot...'));

        const failTimer = win.setTimeout(function() {
            saveButton.disabled = false;
            setNote(msg('debugLogFailed', 'Saving failed'), true);
        }, 15000);

        api.save({ enabled: loggingOn(), level: Number(levelEl.value), topics: topicMask() }, function(ok) {
            win.clearTimeout(failTimer);
            saveButton.disabled = false;
            setNote(ok ? msg('debugLogSaved', 'Saved. Reconnecting after reboot...') : msg('debugLogFailed', 'Saving failed'), !ok);
        });
    });
}
