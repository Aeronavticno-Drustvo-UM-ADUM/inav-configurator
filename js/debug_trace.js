const MAX_LINES = 5000;
const SESSION_MARK = '===== Session started';

function debugTraceOnLoad()
{
    var output = document.getElementById('debug-trace');
    var state = document.getElementById('trace-state');
    var lastText = null;
    var api = window.opener ? window.opener.debugLogApi : null;

    function msg(key, fallback) {
        return (api && api.msg(key)) || fallback;
    }

    function render(text) {
        var lines = text.split('\n');
        if (lines.length > MAX_LINES) {
            lines = lines.slice(-MAX_LINES);
        }
        var fragment = document.createDocumentFragment();
        var shown = 0;
        lines.forEach(function(line) {
            if (line === '') {
                return;
            }
            var el = document.createElement('div');
            el.className = line.indexOf(SESSION_MARK) === 0 ? 'session' : 'line';
            el.textContent = line;
            fragment.appendChild(el);
            shown++;
        });
        if (shown === 0) {
            var empty = document.createElement('div');
            empty.className = 'empty';
            empty.textContent = msg('debugLogWaiting', 'Waiting for debug messages from the flight controller...');
            fragment.appendChild(empty);
        }
        output.replaceChildren(fragment);
        state.textContent = shown + ' ' + msg('debugLogLines', 'lines');
    }

    document.getElementById('trace-clear').addEventListener('click', function() {
        var opener = window.opener;
        if (opener && opener.clearDebugTrace) {
            opener.clearDebugTrace();
        }
    });

    setInterval(function() {
        var opener = window.opener;
        var text = opener && opener.getDebugTrace ? opener.getDebugTrace() : '';
        if (text === lastText) {
            return;
        }
        lastText = text;

        // Keep following the output unless the user scrolled up to read it
        var atBottom = output.scrollHeight - output.scrollTop - output.clientHeight < 20;
        render(text);
        if (atBottom) {
            output.scrollTop = output.scrollHeight;
        }
    }, 100);

    setupLogSettings(api, msg);
}

function setupLogSettings(api, msg) {
    var settingsEl = document.getElementById('log-settings');
    var note = document.getElementById('log-note');
    var optionsEl = document.getElementById('log-options');
    var levelEl = document.getElementById('log-level');
    var topicsButton = document.getElementById('topics-button');
    var topicsPanel = document.getElementById('topics-panel');
    var saveButton = document.getElementById('log-save');
    var enabledRadios = document.querySelectorAll('input[name=log-enabled]');

    document.querySelectorAll('[data-msg]').forEach(function(el) {
        var text = api && api.msg(el.getAttribute('data-msg'));
        if (text) {
            el.textContent = text;
        }
    });

    function setNote(text, isError) {
        note.textContent = text;
        note.classList.toggle('error', !!isError);
    }

    if (!api) {
        settingsEl.style.display = 'none';
        return;
    }

    var topicBoxes = api.TOPICS.map(function(name, bit) {
        var label = document.createElement('label');
        var box = document.createElement('input');
        box.type = 'checkbox';
        box.value = String(bit);
        box.addEventListener('change', updateTopicsLabel);
        label.appendChild(box);
        label.appendChild(document.createTextNode(name));
        topicsPanel.appendChild(label);
        return box;
    });

    api.LEVELS.forEach(function(name, index) {
        var option = document.createElement('option');
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
        var count = topicBoxes.filter(function(box) { return box.checked; }).length;
        topicsButton.textContent = (count ? count + ' / ' + topicBoxes.length : msg('debugLogTopicsNone', 'None')) + ' \u25BE';
    }

    function loggingOn() {
        return document.getElementById('log-on').checked;
    }

    function updateOptionsState() {
        optionsEl.classList.toggle('disabled', !loggingOn());
        topicsPanel.classList.remove('open');
    }

    topicsButton.addEventListener('click', function(event) {
        event.stopPropagation();
        topicsPanel.classList.toggle('open');
    });
    document.addEventListener('click', function(event) {
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
        document.getElementById(current.enabled ? 'log-on' : 'log-off').checked = true;
        levelEl.value = String(current.level);
        topicBoxes.forEach(function(box) {
            box.checked = (current.topics & (1 << Number(box.value))) !== 0;
        });
        updateTopicsLabel();
        updateOptionsState();
        setNote(msg('debugLogPort', 'Log port') + ': ' + current.portName + '. ' + msg('debugLogRebootNote', 'Saving writes to the board and reboots it. Logging can reduce performance.'));
    });

    saveButton.addEventListener('click', function() {
        if (!window.confirm(msg('debugLogConfirm', 'Save the logging settings and reboot the board?'))) {
            return;
        }
        saveButton.disabled = true;
        setNote(msg('debugLogSaving', 'Saving, the board will reboot...'));

        var failTimer = setTimeout(function() {
            saveButton.disabled = false;
            setNote(msg('debugLogFailed', 'Saving failed'), true);
        }, 15000);

        api.save({ enabled: loggingOn(), level: Number(levelEl.value), topics: topicMask() }, function(ok) {
            clearTimeout(failTimer);
            saveButton.disabled = false;
            setNote(ok ? msg('debugLogSaved', 'Saved. Reconnecting after reboot...') : msg('debugLogFailed', 'Saving failed'), !ok);
        });
    });
}

window.onload = debugTraceOnLoad;
