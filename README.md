# symfony-command-ui

**Web UI + API to execute Symfony console commands from the browser — or from any AI agent.**

Drop this bundle into any Symfony project (5.4, 6.x, 7.x) and get:

- A **web dashboard** where you can select, configure, and run any whitelisted `bin/console` command
- A **streaming terminal** that shows output in real-time (NDJSON protocol)
- An **auto-discovery API** that exposes your commands as structured JSON — ready for LLMs, AI agents, or MCP servers
- **Zero JavaScript configuration** — the Web Component discovers commands automatically

## Why this matters

### For humans

You maintain a Symfony app with 20+ console commands. Some you run daily, some monthly, some only when debugging. Today you SSH into the server, remember the exact syntax, type it out. With this bundle, you open a URL and click Run.

### For AI agents

Your Symfony commands encapsulate business logic: process payments, sync users, generate reports, manage subscriptions. An LLM agent can now:

1. `GET /symfony-console/commands` — discover what operations are available
2. Read the structured JSON — understand each command's options, defaults, types
3. `POST /symfony-console/execute` — run the command with chosen options
4. Stream the NDJSON output — observe results in real-time

This is essentially an **MCP-compatible endpoint** for your Symfony application. Any AI agent that can make HTTP calls can now operate your app's business logic through your existing console commands.

## Installation

```bash
composer require pascualmg/symfony-command-ui
```

### Register the bundle

```php
// config/bundles.php
return [
    // ...
    Pascualmg\SymfonyCommandUI\SymfonyCommandUIBundle::class => ['all' => true],
];
```

### Import routes

```yaml
# config/routes/symfony_command_ui.yaml
symfony_command_ui:
    resource: '@SymfonyCommandUIBundle/Resources/config/routes.php'
    prefix: /symfony-console   # or whatever prefix you want
```

### Configure

```yaml
# config/packages/symfony_command_ui.yaml
symfony_command_ui:
    route_prefix: /symfony-console
    allowed_commands:
        - app:users:list
        - app:payments:process
        - app:reports:generate
        - app:cache:warmup
    overrides:
        app:payments:process:
            --gateway: [stripe, paypal, braintree]
            --limit: [10, 50, 100, 500]
        app:reports:generate:
            --format: [pdf, csv, json]
```

### Done

Open `https://your-app.com/symfony-console` in your browser. Your commands are ready.

## How it works

### Auto-discovery

The bundle runs `php bin/console list --format=json` via `Symfony\Component\Process` and filters by your whitelist. Each command's `InputDefinition` (arguments, options, defaults) is translated to a JSON config that the Web Component understands:

| Symfony InputOption | JSON value | Web Component UI |
|---|---|---|
| `VALUE_NONE` (flag) | `false` | Checkbox |
| `VALUE_REQUIRED` with default | `"default"` | Text input (pre-filled) |
| `VALUE_REQUIRED` no default | `""` | Text input (empty) |
| Override with array | `["a","b","c"]` | Dropdown select |

### Streaming protocol (NDJSON)

When you execute a command, the backend streams each line of stdout as a JSON object:

```
{"type":"line","text":"Processing batch 1..."}
{"type":"line","text":"[OK] 95 items processed"}
{"type":"complete","exitCode":0,"duration":"2.3s"}
```

The Web Component renders each line in real-time with color-coded output:
- `line` → gray (info)
- `batch` → blue
- `complete` with `exitCode=0` → green (success)
- `complete` with `exitCode!=0` → red (error)

### Web Component

A single `<symfony-command>` custom element with Shadow DOM. Zero dependencies. The bundle serves it as a static asset — no npm, no webpack, no build step.

```html
<!-- Auto-discovery mode (recommended) -->
<symfony-command endpoint="/symfony-console"></symfony-command>

<!-- Static mode (commands provided directly) -->
<symfony-command
  endpoint="/symfony-console"
  commands='[{"command":"app:example","label":"Example","config":{"--verbose":false}}]'>
</symfony-command>
```

### Theming

Override CSS custom properties to match your app:

```css
symfony-command {
    --cmd-bg: #ffffff;
    --cmd-surface: #f5f5f5;
    --cmd-text: #333333;
    --cmd-success: #28a745;
    --cmd-error: #dc3545;
    --cmd-accent: #007bff;
}
```

## Using with AI agents

### As an MCP-compatible endpoint

Any agent that speaks HTTP can control your Symfony app:

```python
# AI agent discovers available commands
commands = requests.get("https://app.com/symfony-console/commands").json()
# [{"command": "app:users:sync", "label": "Sync users", "config": {"--limit": [100,500], "--dry-run": false}}]

# Agent decides to run a sync
response = requests.post("https://app.com/symfony-console/execute", json={
    "command": "app:users:sync",
    "options": {"--limit": 100, "--dry-run": True}
}, stream=True)

# Agent reads streaming output
for line in response.iter_lines():
    event = json.loads(line)
    if event["type"] == "complete":
        print(f"Exit code: {event['exitCode']}")
```

### With Claude Code / MCP

Create an MCP tool that wraps these endpoints, and your AI assistant can run your Symfony commands conversationally:

> **You**: "Sync the first 100 users with dry-run"
>
> **Claude**: *calls POST /symfony-console/execute with {"command":"app:users:sync","options":{"--limit":100,"--dry-run":true}}*
>
> **Claude**: "Dry run complete: 100 users would be synced, 3 have conflicts. Want me to run it for real?"

## Security

**This bundle does NOT include authentication.** You must protect the routes yourself using your project's security layer:

```yaml
# config/packages/security.yaml
security:
    access_control:
        - { path: ^/symfony-console, roles: ROLE_ADMIN }
```

Or use a firewall, IP whitelist, VPN, or whatever fits your setup. The bundle only provides the `allowed_commands` whitelist to restrict which commands can be executed.

## Configuration reference

```yaml
symfony_command_ui:
    # URL prefix for all endpoints
    route_prefix: /symfony-console   # default

    # Only these commands can be discovered and executed
    allowed_commands:
        - app:my:command
        - app:another:command

    # Override auto-discovered options with dropdown values
    overrides:
        app:my:command:
            --option-name: [value1, value2, value3]
```

## Requirements

- PHP >= 7.4
- Symfony 5.4, 6.x, or 7.x
- `symfony/process` component

## License

MIT
