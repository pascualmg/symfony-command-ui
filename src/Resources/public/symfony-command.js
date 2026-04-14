/**
 * <symfony-command> — Web Component for executing Symfony console commands.
 *
 * Drop this single file into any project. Zero dependencies.
 *
 * Usage:
 *   <script type="module" src="symfony-command.js"></script>
 *   <symfony-command endpoint="/symfony-console"></symfony-command>
 *
 * Each command renders as an independent card with its own form,
 * Run button, and terminal output. Outputs persist across commands.
 *
 * @author Pascual Munoz Galian <info@pascualmg.dev>
 * @license MIT
 */

// ============================================================
// INTERNAL: CommandCard — one command = one card with form + output
// ============================================================
class CommandCard {
    constructor(container, cmd, endpoint) {
        this._container = container;
        this._cmd = cmd;
        this._endpoint = endpoint;
        this._running = false;
        this._hasOutput = false;
        this._render();
    }

    _render() {
        const cmd = this._cmd;
        const card = document.createElement('div');
        card.className = 'card';

        // Header
        const header = document.createElement('div');
        header.className = 'card-header';
        header.innerHTML = `
            <div class="card-title">${this._esc(cmd.command)}</div>
            <div class="card-desc">${this._esc(cmd.label)}</div>
        `;
        card.appendChild(header);

        // Options
        const options = document.createElement('div');
        options.className = 'card-options';
        options.innerHTML = this._buildOptions(cmd.config || {});
        card.appendChild(options);
        this._optionsEl = options;

        // Actions bar
        const actions = document.createElement('div');
        actions.className = 'card-actions';
        this._runBtn = document.createElement('button');
        this._runBtn.className = 'run-btn';
        this._runBtn.textContent = 'Run';
        this._runBtn.addEventListener('click', () => this._execute());
        actions.appendChild(this._runBtn);

        this._copyBtn = document.createElement('button');
        this._copyBtn.className = 'action-btn';
        this._copyBtn.textContent = 'Copy';
        this._copyBtn.addEventListener('click', () => this._copy());
        actions.appendChild(this._copyBtn);

        this._clearBtn = document.createElement('button');
        this._clearBtn.className = 'action-btn';
        this._clearBtn.textContent = 'Clear';
        this._clearBtn.addEventListener('click', () => this._clearOutput());
        actions.appendChild(this._clearBtn);

        card.appendChild(actions);

        // Output terminal
        const output = document.createElement('div');
        output.className = 'card-output';
        output.innerHTML = '<div class="empty">Ready</div>';
        card.appendChild(output);
        this._outputEl = output;

        this._container.appendChild(card);
    }

    _buildOptions(config) {
        let html = '';
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
                html += `<label class="opt-input"><span>${this._esc(label)}</span><input type="text" data-option="${this._esc(key)}" placeholder="${this._esc(label)}"></label>`;
            }
        }
        return html;
    }

    _collectOptions() {
        const options = {};
        this._optionsEl.querySelectorAll('[data-option]').forEach(el => {
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
        return options;
    }

    _appendLine(text, type, chrome) {
        if (!this._hasOutput) {
            this._outputEl.innerHTML = '';
            this._hasOutput = true;
        }
        const line = document.createElement('div');
        line.className = 'line ' + (type || 'info') + (chrome ? ' chrome' : '');
        const ts = document.createElement('span');
        ts.className = 'ts';
        ts.textContent = new Date().toLocaleTimeString();
        const content = document.createElement('span');
        content.textContent = text;
        line.appendChild(ts);
        line.appendChild(content);
        this._outputEl.appendChild(line);
        this._outputEl.scrollTop = this._outputEl.scrollHeight;
    }

    _clearOutput() {
        this._hasOutput = false;
        this._outputEl.innerHTML = '<div class="empty">Ready</div>';
    }

    _copy() {
        const lines = this._outputEl.querySelectorAll('.line:not(.chrome) span:last-child');
        const text = Array.from(lines).map(s => s.textContent).join('\n');
        navigator.clipboard.writeText(text).then(() => {
            this._copyBtn.textContent = 'Copied!';
            setTimeout(() => { this._copyBtn.textContent = 'Copy'; }, 1500);
        });
    }

    async _execute() {
        if (this._running) return;
        this._running = true;
        this._runBtn.textContent = 'Running...';
        this._runBtn.disabled = true;

        const cmd = this._cmd;
        const options = this._collectOptions();

        this._clearOutput();
        this._appendLine(`$ bin/console ${cmd.command} ${Object.entries(options).map(([k,v]) => v === true ? k : `${k}=${v}`).filter(x => !x.endsWith('=false')).join(' ')}`, 'info', true);

        try {
            const res = await fetch(this._endpoint + '/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: cmd.command, options }),
            });

            if (!res.ok) {
                const err = await res.text();
                this._appendLine(`HTTP ${res.status}: ${err}`, 'error');
                this._setDone();
                return;
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

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
                            const ok = data.exitCode === 0 || data.exitCode === undefined;
                            this._appendLine(
                                `[${ok ? 'OK' : 'FAIL'}] exit=${data.exitCode ?? 0} duration=${data.duration || '?'}`,
                                ok ? 'success' : 'error', true
                            );
                        } else if (data.type === 'batch') {
                            this._appendLine(
                                `[batch ${data.batch}] processed=${data.processed} errors=${data.errors || 0}`,
                                'batch'
                            );
                        } else {
                            this._appendLine(data.text || JSON.stringify(data), 'info');
                        }
                    } catch {
                        this._appendLine(line, 'info');
                    }
                }
            }
        } catch (err) {
            this._appendLine(`Error: ${err.message}`, 'error');
        }

        this._setDone();
    }

    _setDone() {
        this._running = false;
        this._runBtn.textContent = 'Run';
        this._runBtn.disabled = false;
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
            this._commands = JSON.parse(commandsAttr);
            this._render();
        } else {
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
        const commands = this._commands || [];
        const endpoint = this.getAttribute('endpoint') || '/api/console';

        this.shadowRoot.innerHTML = `
            <style>${SymfonyCommand.STYLES}</style>
            <div class="wrapper"></div>
        `;

        const wrapper = this.shadowRoot.querySelector('.wrapper');
        commands.forEach(cmd => new CommandCard(wrapper, cmd, endpoint));
    }
}

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
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    /* === CARD === */
    .card {
        background: var(--cmd-surface);
        border: 1px solid var(--cmd-border);
        border-radius: var(--cmd-radius);
        overflow: hidden;
    }
    .card-header {
        padding: 12px 16px 8px;
    }
    .card-title {
        font-size: 13px;
        color: var(--cmd-accent);
        font-weight: 600;
    }
    .card-desc {
        font-size: 11px;
        color: var(--cmd-info);
        margin-top: 2px;
    }
    .card-options {
        padding: 0 16px 8px;
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
    }
    .card-actions {
        padding: 0 16px 10px;
        display: flex;
        gap: 6px;
        align-items: center;
    }

    /* === OPTIONS === */
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

    /* === BUTTONS === */
    .run-btn {
        padding: 6px 18px;
        background: var(--cmd-accent);
        color: var(--cmd-bg);
        border: none;
        border-radius: var(--cmd-radius);
        cursor: pointer;
        font-family: var(--cmd-font);
        font-size: 12px;
        font-weight: 600;
        transition: opacity 0.15s;
    }
    .run-btn:hover { opacity: 0.85; }
    .run-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .action-btn {
        background: transparent;
        color: var(--cmd-info);
        border: 1px solid var(--cmd-border);
        border-radius: 4px;
        padding: 4px 12px;
        font-size: 11px;
        cursor: pointer;
        font-family: var(--cmd-font);
    }
    .action-btn:hover { color: var(--cmd-text); border-color: var(--cmd-accent); }

    /* === OUTPUT === */
    .card-output {
        background: var(--cmd-bg);
        border-top: 1px solid var(--cmd-border);
        max-height: 300px;
        overflow-y: auto;
        padding: 8px 16px;
        font-size: 12px;
        line-height: 1.6;
    }
    .empty {
        color: var(--cmd-info);
        font-style: italic;
        padding: 8px 0;
        text-align: center;
        font-size: 11px;
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
