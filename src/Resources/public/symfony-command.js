/**
 * <symfony-command> — Web Component for executing Symfony console commands.
 *
 * Drop this single file into any project. Zero dependencies.
 *
 * Usage:
 *   <script type="module" src="symfony-command.js"></script>
 *   <symfony-command
 *     endpoint="/api/console"
 *     commands='[{"command":"app:example","label":"Example","config":{"--verbose":true,"--limit":[10,50,100]}}]'>
 *   </symfony-command>
 *
 * Backend protocol:
 *   POST endpoint with {"command":"app:example","options":{"--verbose":true,"--limit":50}}
 *   Response: NDJSON stream (Content-Type: application/x-ndjson)
 *     {"type":"line","text":"output..."}
 *     {"type":"complete","exitCode":0,"duration":"1.2s"}
 *
 * Theming: override CSS custom properties on the element.
 *
 * @author Pascual Munoz Galian <info@pascualmg.dev>
 * @license MIT
 */

// ============================================================
// INTERNAL: CommandOutput — terminal visual
// ============================================================
class CommandOutput {
    constructor(container) {
        this._container = container;
        this._hasContent = false;
        this._render();
    }

    _render() {
        this._container.innerHTML = `
            <div class="terminal">
                <div class="terminal-header">
                    <span class="terminal-title">Output</span>
                    <button class="clear-btn">Clear</button>
                </div>
                <div class="output">
                    <div class="empty">Waiting for command...</div>
                </div>
            </div>
        `;
        this._output = this._container.querySelector('.output');
        this._container.querySelector('.clear-btn').addEventListener('click', () => this.clear());
    }

    appendLine(text, type) {
        if (!this._hasContent) {
            this._output.innerHTML = '';
            this._hasContent = true;
        }
        const line = document.createElement('div');
        line.className = 'line ' + (type || 'info');
        const ts = document.createElement('span');
        ts.className = 'ts';
        ts.textContent = new Date().toLocaleTimeString();
        const content = document.createElement('span');
        content.textContent = text;
        line.appendChild(ts);
        line.appendChild(content);
        this._output.appendChild(line);
        this._output.scrollTop = this._output.scrollHeight;
    }

    clear() {
        this._hasContent = false;
        this._output.innerHTML = '<div class="empty">Waiting for command...</div>';
    }
}

// ============================================================
// INTERNAL: CommandForm — dynamic form from config JSON
// ============================================================
class CommandForm {
    constructor(container, commands, onExecute) {
        this._container = container;
        this._commands = commands;
        this._onExecute = onExecute;
        this._selectedIndex = 0;
        this._running = false;
        this._render();
    }

    _render() {
        let html = '<div class="form-area">';

        // Command selector (tabs if multiple, hidden if single)
        if (this._commands.length > 1) {
            html += '<div class="cmd-tabs">';
            this._commands.forEach((cmd, i) => {
                const active = i === this._selectedIndex ? ' active' : '';
                html += `<button class="cmd-tab${active}" data-index="${i}">${this._esc(cmd.label)}</button>`;
            });
            html += '</div>';
        }

        // Form for each command (only selected visible)
        this._commands.forEach((cmd, i) => {
            const display = i === this._selectedIndex ? 'block' : 'none';
            html += `<div class="cmd-form" data-index="${i}" style="display:${display}">`;
            html += this._buildOptions(cmd.config || {});
            html += '</div>';
        });

        // Run button
        html += '<div class="cmd-actions">';
        html += '<button class="run-btn" id="run-btn">Run</button>';
        html += '</div>';
        html += '</div>';

        this._container.innerHTML = html;
        this._setupListeners();
    }

    _buildOptions(config) {
        let html = '<div class="cmd-options">';
        for (const [key, value] of Object.entries(config)) {
            const label = key.replace(/^--?/, '');
            if (typeof value === 'boolean') {
                const checked = value ? ' checked' : '';
                html += `<label class="opt-check"><input type="checkbox" data-option="${this._esc(key)}"${checked}> ${this._esc(label)}</label>`;
            } else if (Array.isArray(value) && value.length > 0) {
                html += `<label class="opt-select"><span>${this._esc(label)}</span><select data-option="${this._esc(key)}">`;
                value.forEach(v => { html += `<option value="${this._esc(String(v))}">${this._esc(String(v))}</option>`; });
                html += '</select></label>';
            } else if (typeof value === 'string') {
                html += `<label class="opt-input"><span>${this._esc(label)}</span><input type="text" data-option="${this._esc(key)}" value="${this._esc(value)}"></label>`;
            } else {
                // [] empty array = free text
                html += `<label class="opt-input"><span>${this._esc(label)}</span><input type="text" data-option="${this._esc(key)}" placeholder="${this._esc(label)}"></label>`;
            }
        }
        html += '</div>';
        return html;
    }

    _setupListeners() {
        // Tab switching
        this._container.querySelectorAll('.cmd-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                if (this._running) return;
                this._selectedIndex = parseInt(tab.dataset.index);
                this._render();
            });
        });
        // Run
        this._container.querySelector('#run-btn').addEventListener('click', () => {
            if (this._running) return;
            this._execute();
        });
    }

    _execute() {
        const cmd = this._commands[this._selectedIndex];
        const form = this._container.querySelector(`.cmd-form[data-index="${this._selectedIndex}"]`);
        const options = {};

        form.querySelectorAll('[data-option]').forEach(el => {
            const key = el.dataset.option;
            if (el.type === 'checkbox') {
                options[key] = el.checked;
            } else if (el.tagName === 'SELECT') {
                let val = el.value;
                if (val !== '' && !isNaN(val)) val = Number(val);
                options[key] = val;
            } else {
                if (el.value !== '') options[key] = el.value;
            }
        });

        this._onExecute(cmd, options);
    }

    setStatus(status) {
        this._running = status === 'running';
        const btn = this._container.querySelector('#run-btn');
        if (!btn) return;
        if (status === 'running') {
            btn.textContent = 'Running...';
            btn.disabled = true;
        } else if (status === 'error') {
            btn.textContent = 'Run';
            btn.disabled = false;
        } else {
            btn.textContent = 'Run';
            btn.disabled = false;
        }
    }

    _esc(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }
}

// ============================================================
// PUBLIC: <symfony-command>
// ============================================================
class SymfonyCommand extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    static get observedAttributes() {
        return ['commands', 'endpoint'];
    }

    connectedCallback() {
        const commandsAttr = this.getAttribute('commands');
        if (commandsAttr) {
            // Static mode: commands provided as attribute
            this._commands = JSON.parse(commandsAttr);
            this._render();
        } else {
            // Auto-discovery mode: fetch from backend
            this._showLoading();
            const endpoint = this.getAttribute('endpoint') || '/api/console';
            fetch(endpoint + '/commands')
                .then(r => r.json())
                .then(commands => {
                    this._commands = commands;
                    this._render();
                })
                .catch(err => {
                    this.shadowRoot.innerHTML = `<style>${SymfonyCommand.STYLES}</style>
                        <div class="wrapper" style="padding:20px;color:var(--cmd-error)">
                            Failed to discover commands: ${err.message}
                        </div>`;
                });
        }
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue !== newValue && this.isConnected) this.connectedCallback();
    }

    _showLoading() {
        this.shadowRoot.innerHTML = `<style>${SymfonyCommand.STYLES}</style>
            <div class="wrapper" style="padding:20px;color:var(--cmd-info);text-align:center">
                Discovering commands...
            </div>`;
    }

    _render() {
        const commands = this._commands || this._parseCommands();
        const endpoint = this.getAttribute('endpoint') || '/api/console';

        this.shadowRoot.innerHTML = `
            <style>${SymfonyCommand.STYLES}</style>
            <div class="wrapper">
                <div class="form-container"></div>
                <div class="output-container"></div>
            </div>
        `;

        this._output = new CommandOutput(this.shadowRoot.querySelector('.output-container'));
        this._form = new CommandForm(
            this.shadowRoot.querySelector('.form-container'),
            commands,
            (cmd, options) => this._executeCommand(endpoint, cmd, options)
        );
    }

    _parseCommands() {
        try {
            return JSON.parse(this.getAttribute('commands') || '[]');
        } catch {
            return [];
        }
    }

    async _executeCommand(endpoint, cmd, options) {
        this._form.setStatus('running');
        this._output.clear();
        this._output.appendLine(`$ bin/console ${cmd.command} ${Object.entries(options).map(([k,v]) => v === true ? k : `${k}=${v}`).filter(x => !x.endsWith('=false')).join(' ')}`, 'info');

        this.dispatchEvent(new CustomEvent('command-started', {
            detail: { command: cmd.command, options }
        }));

        try {
            const res = await fetch(endpoint + '/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: cmd.command, options }),
            });

            if (!res.ok) {
                const err = await res.text();
                this._output.appendLine(`HTTP ${res.status}: ${err}`, 'error');
                this._form.setStatus('error');
                this.dispatchEvent(new CustomEvent('command-error', {
                    detail: { command: cmd.command, error: err }
                }));
                return;
            }

            // NDJSON streaming
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let lastComplete = null;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const data = JSON.parse(line);
                        if (data.type === 'complete') {
                            lastComplete = data;
                            const ok = data.exitCode === 0 || data.exitCode === undefined;
                            const icon = ok ? 'OK' : 'FAIL';
                            this._output.appendLine(
                                `[${icon}] exit=${data.exitCode ?? 0} duration=${data.duration || '?'}`,
                                ok ? 'success' : 'error'
                            );
                        } else if (data.type === 'batch') {
                            this._output.appendLine(
                                `[batch ${data.batch}] processed=${data.processed} errors=${data.errors || 0}`,
                                'batch'
                            );
                        } else {
                            this._output.appendLine(data.text || JSON.stringify(data), 'info');
                        }
                    } catch {
                        this._output.appendLine(line, 'info');
                    }
                }
            }

            this._form.setStatus('done');
            this.dispatchEvent(new CustomEvent('command-completed', {
                detail: {
                    command: cmd.command,
                    exitCode: lastComplete?.exitCode ?? 0,
                    duration: lastComplete?.duration,
                }
            }));
        } catch (err) {
            this._output.appendLine(`Error: ${err.message}`, 'error');
            this._form.setStatus('error');
            this.dispatchEvent(new CustomEvent('command-error', {
                detail: { command: cmd.command, error: err.message }
            }));
        }
    }
}

// CSS — customizable via --cmd-* properties
SymfonyCommand.STYLES = `
    :host {
        display: block;
        --cmd-bg: #0a0a1a;
        --cmd-surface: #1a1a2e;
        --cmd-text: #e0e0e0;
        --cmd-info: #a0a0a0;
        --cmd-success: #00ff88;
        --cmd-error: #ff4444;
        --cmd-batch: #4488ff;
        --cmd-accent: #4ecca3;
        --cmd-border: rgba(255,255,255,0.08);
        --cmd-font: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
        --cmd-radius: 8px;
    }
    .wrapper {
        font-family: var(--cmd-font);
        color: var(--cmd-text);
        background: var(--cmd-bg);
        border-radius: var(--cmd-radius);
        border: 1px solid var(--cmd-border);
        overflow: hidden;
    }

    /* === FORM === */
    .form-area {
        background: var(--cmd-surface);
        padding: 12px 16px;
        border-bottom: 1px solid var(--cmd-border);
    }
    .cmd-tabs {
        display: flex;
        gap: 4px;
        margin-bottom: 12px;
    }
    .cmd-tab {
        padding: 6px 14px;
        background: transparent;
        color: var(--cmd-info);
        border: 1px solid var(--cmd-border);
        border-radius: var(--cmd-radius);
        cursor: pointer;
        font-family: var(--cmd-font);
        font-size: 12px;
        transition: all 0.15s;
    }
    .cmd-tab:hover { color: var(--cmd-text); border-color: var(--cmd-accent); }
    .cmd-tab.active {
        background: var(--cmd-accent);
        color: var(--cmd-bg);
        border-color: var(--cmd-accent);
    }
    .cmd-options {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
    }
    .opt-check, .opt-select, .opt-input {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: var(--cmd-info);
    }
    .opt-check input { accent-color: var(--cmd-accent); }
    select, input[type="text"] {
        background: var(--cmd-bg);
        color: var(--cmd-text);
        border: 1px solid var(--cmd-border);
        border-radius: 4px;
        padding: 4px 8px;
        font-family: var(--cmd-font);
        font-size: 12px;
    }
    select:focus, input[type="text"]:focus {
        outline: 1px solid var(--cmd-accent);
    }
    .cmd-actions {
        margin-top: 12px;
    }
    .run-btn {
        padding: 8px 24px;
        background: var(--cmd-accent);
        color: var(--cmd-bg);
        border: none;
        border-radius: var(--cmd-radius);
        cursor: pointer;
        font-family: var(--cmd-font);
        font-size: 13px;
        font-weight: 600;
        transition: opacity 0.15s;
    }
    .run-btn:hover { opacity: 0.85; }
    .run-btn:disabled { opacity: 0.4; cursor: not-allowed; }

    /* === TERMINAL === */
    .terminal {
        background: var(--cmd-bg);
    }
    .terminal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 16px;
        border-bottom: 1px solid var(--cmd-border);
    }
    .terminal-title {
        font-size: 11px;
        color: var(--cmd-info);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    .clear-btn {
        background: transparent;
        color: var(--cmd-info);
        border: 1px solid var(--cmd-border);
        border-radius: 4px;
        padding: 2px 10px;
        font-size: 11px;
        cursor: pointer;
        font-family: var(--cmd-font);
    }
    .clear-btn:hover { color: var(--cmd-text); border-color: var(--cmd-accent); }
    .output {
        max-height: 400px;
        overflow-y: auto;
        padding: 8px 16px;
        font-size: 12px;
        line-height: 1.6;
    }
    .empty {
        color: var(--cmd-info);
        font-style: italic;
        padding: 20px 0;
        text-align: center;
    }
    .line {
        white-space: pre-wrap;
        word-break: break-all;
    }
    .line .ts {
        color: rgba(255,255,255,0.15);
        margin-right: 10px;
        font-size: 11px;
    }
    .line.info { color: var(--cmd-info); }
    .line.success { color: var(--cmd-success); }
    .line.error { color: var(--cmd-error); }
    .line.batch { color: var(--cmd-batch); }
`;

customElements.define('symfony-command', SymfonyCommand);
export default SymfonyCommand;
