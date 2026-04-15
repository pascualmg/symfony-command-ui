<?php

declare(strict_types=1);

namespace Pascualmg\SymfonyCommandUI\Controller;

use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\Process\PhpExecutableFinder;
use Symfony\Component\Process\Process;
use Symfony\Component\Routing\Annotation\Route;

/**
 * Web UI + API for executing Symfony console commands.
 *
 * Three endpoints:
 *   GET  {prefix}/           → HTML page with <symfony-command> Web Component
 *   GET  {prefix}/commands   → Auto-discovered command list as JSON
 *   POST {prefix}/execute    → Execute a command, streaming output as NDJSON
 *
 * The Web Component auto-discovers available commands on mount and renders
 * a dynamic form + streaming terminal. Zero configuration in the HTML.
 *
 * Compatible with AI agents: GET /commands returns structured JSON that any
 * LLM can understand, POST /execute accepts {command, options} and streams
 * output. Works as an MCP-compatible endpoint.
 */
class CommandController
{
    private const TIMEOUT_SECONDS = 60;

    private string $projectDir;
    private bool $thisIsReallyDangerous;
    private bool $exposeAll;
    private array $allowedCommands;
    private array $allowedNamespaces;
    private array $excludedCommands;
    private array $excludedNamespaces;
    private array $configOverrides;
    private string $routePrefix;
    private bool $collapsedByDefault;

    public function __construct(
        string $projectDir,
        bool $thisIsReallyDangerous,
        bool $exposeAll,
        array $allowedCommands,
        array $allowedNamespaces,
        array $excludedCommands,
        array $excludedNamespaces,
        array $configOverrides,
        string $routePrefix,
        bool $collapsedByDefault
    ) {
        $this->projectDir = $projectDir;
        $this->thisIsReallyDangerous = $thisIsReallyDangerous;
        $this->exposeAll = $exposeAll;
        $this->allowedCommands = $allowedCommands;
        $this->allowedNamespaces = $allowedNamespaces;
        $this->excludedCommands = $excludedCommands;
        $this->excludedNamespaces = $excludedNamespaces;
        $this->configOverrides = $configOverrides;
        $this->routePrefix = $routePrefix;
        $this->collapsedByDefault = $collapsedByDefault;
    }

    /**
     * Decides whether a command name passes the current allow/deny rules.
     *
     * Order: this_is_really_dangerous bypasses everything. Otherwise explicit
     * deny wins, then expose_all, then allowed_commands exact, then
     * allowed_namespaces prefix. No match → denied.
     */
    private function isCommandAllowed(string $name): bool
    {
        if ($this->thisIsReallyDangerous) {
            return true;
        }
        if (\in_array($name, $this->excludedCommands, true)) {
            return false;
        }
        foreach ($this->excludedNamespaces as $prefix) {
            if ('' !== $prefix && 0 === \strpos($name, $prefix)) {
                return false;
            }
        }

        if ($this->exposeAll) {
            return true;
        }
        if (\in_array($name, $this->allowedCommands, true)) {
            return true;
        }
        foreach ($this->allowedNamespaces as $prefix) {
            if ('' !== $prefix && 0 === \strpos($name, $prefix)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Serves the HTML page with the <symfony-command> Web Component.
     * The component auto-discovers commands via the /commands endpoint.
     *
     * @Route("", methods={"GET"}, name="symfony_command_ui_page")
     */
    public function page(): Response
    {
        $prefix = \rtrim($this->routePrefix, '/');
        $collapsed = $this->collapsedByDefault ? 'true' : 'false';

        $html = <<<HTML
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Symfony Console</title>
    <script type="module" src="{$prefix}/asset/symfony-command.js"></script>
    <style>
        body {
            margin: 0;
            padding: 20px;
            background: #0a0a1a;
            color: #e0e0e0;
            font-family: 'Segoe UI', system-ui, sans-serif;
        }
        h1 {
            font-size: 18px;
            margin: 0 0 16px;
            color: #4ecca3;
            font-family: 'JetBrains Mono', monospace;
        }
    </style>
</head>
<body>
    <h1>$ symfony console</h1>
    <symfony-command endpoint="{$prefix}" collapsed-by-default="{$collapsed}"></symfony-command>
</body>
</html>
HTML;

        return new Response($html, Response::HTTP_OK, ['Content-Type' => 'text/html']);
    }

    /**
     * Serves the Web Component JS asset.
     *
     * @Route("/asset/symfony-command.js", methods={"GET"}, name="symfony_command_ui_asset")
     */
    public function asset(Request $request): Response
    {
        $jsPath = \dirname(__DIR__).'/Resources/public/symfony-command.js';

        if (!\file_exists($jsPath)) {
            return new Response('Asset not found', Response::HTTP_NOT_FOUND);
        }

        $content = \file_get_contents($jsPath);
        $etag = '"'.\md5($content).'"';

        $response = new Response(
            $content,
            Response::HTTP_OK,
            [
                'Content-Type' => 'application/javascript',
                'Cache-Control' => 'no-cache',
                'ETag' => $etag,
            ]
        );
        $response->isNotModified($request);

        return $response;
    }

    /**
     * Auto-discovers whitelisted commands and returns JSON for the Web Component.
     *
     * Uses `bin/console list --format=json` via Process to avoid conflicts
     * with the HTTP kernel. Returns only commands in the whitelist.
     *
     * Response format:
     * [
     *   {
     *     "command": "app:example",
     *     "label": "Human description",
     *     "config": {
     *       "--verbose": false,        // checkbox
     *       "--limit": [10, 50, 100],  // dropdown (from override)
     *       "--email": "default@x.com" // text input with default
     *     }
     *   }
     * ]
     *
     * @Route("/commands", methods={"GET"}, name="symfony_command_ui_commands")
     */
    public function commands(): JsonResponse
    {
        $phpBinary = (new PhpExecutableFinder())->find() ?: 'php';
        $process = new Process([$phpBinary, 'bin/console', 'list', '--format=json'], $this->projectDir);
        $process->setTimeout(10);
        $process->run();

        if (!$process->isSuccessful()) {
            return new JsonResponse(['error' => 'Failed to list commands'], Response::HTTP_INTERNAL_SERVER_ERROR);
        }

        $allCommands = \json_decode($process->getOutput(), true);
        if (!\is_array($allCommands)) {
            return new JsonResponse(['error' => 'Invalid command list output'], Response::HTTP_INTERNAL_SERVER_ERROR);
        }

        $result = [];

        foreach ($allCommands['commands'] ?? [] as $cmd) {
            $name = $cmd['name'] ?? '';
            if ('' === $name || !$this->isCommandAllowed($name)) {
                continue;
            }

            $config = [];
            $definition = $cmd['definition'] ?? [];

            foreach ($definition['arguments'] ?? [] as $argName => $arg) {
                if ('command' === $argName) {
                    continue;
                }
                $config[$argName] = $arg['default'] ?? '';
            }

            foreach ($definition['options'] ?? [] as $optName => $opt) {
                if (\in_array($optName, ['help', 'quiet', 'verbose', 'version', 'ansi', 'no-ansi', 'no-interaction', 'env', 'no-debug'], true)) {
                    continue;
                }
                $key = '--'.$optName;
                $acceptsValue = $opt['accept_value'] ?? true;
                if (!$acceptsValue) {
                    $config[$key] = false;
                } elseif (null !== ($opt['default'] ?? null) && '' !== ($opt['default'] ?? '')) {
                    $config[$key] = $opt['default'];
                } else {
                    $config[$key] = '';
                }
            }

            if (isset($this->configOverrides[$name])) {
                $config = \array_merge($config, $this->configOverrides[$name]);
            }

            $result[] = [
                'command' => $name,
                'label' => $cmd['description'] ?? $name,
                'config' => $config,
            ];
        }

        return new JsonResponse($result);
    }

    /**
     * Executes a whitelisted command and streams output as NDJSON.
     *
     * Request:
     *   POST {prefix}/execute
     *   {"command": "app:example", "options": {"--verbose": true, "--limit": 100}}
     *
     * Response (NDJSON stream):
     *   {"type":"line","text":"Processing..."}
     *   {"type":"line","text":"Done."}
     *   {"type":"complete","exitCode":0,"duration":"1.2s"}
     *
     * @Route("/execute", methods={"POST"}, name="symfony_command_ui_execute")
     */
    public function execute(Request $request): Response
    {
        $body = $this->decodeBody($request);
        $command = $body['command'] ?? '';
        $options = $body['options'] ?? [];

        if ('' === $command || !$this->isCommandAllowed($command)) {
            return new JsonResponse(
                ['error' => \sprintf('Command not allowed: %s', $command)],
                Response::HTTP_FORBIDDEN
            );
        }

        $args = $this->buildArgs($command, $options);

        $response = new StreamedResponse(function () use ($args): void {
            \set_time_limit(0);
            $start = \microtime(true);

            $phpBinary = (new PhpExecutableFinder())->find() ?: 'php';

            $process = new Process(
                \array_merge([$phpBinary, 'bin/console'], $args, ['--no-interaction']),
                $this->projectDir
            );
            $process->setTimeout(self::TIMEOUT_SECONDS);
            $process->start();

            foreach ($process as $type => $data) {
                foreach (\explode("\n", $data) as $line) {
                    $line = \trim($line);
                    if ('' === $line) {
                        continue;
                    }
                    $this->emitNdjson(['type' => 'line', 'text' => $line]);
                }
            }

            $duration = \round(\microtime(true) - $start, 1);
            $this->emitNdjson([
                'type' => 'complete',
                'exitCode' => $process->getExitCode(),
                'duration' => "{$duration}s",
            ]);
        });

        $response->headers->set('Content-Type', 'application/x-ndjson');
        $response->headers->set('X-Accel-Buffering', 'no');
        $response->headers->set('Cache-Control', 'no-cache');

        return $response;
    }

    private function buildArgs(string $command, array $options): array
    {
        $args = [$command];

        foreach ($options as $key => $value) {
            if (true === $value) {
                $args[] = $key;
            } elseif (false !== $value && '' !== $value && null !== $value) {
                // Positional arguments (no -- prefix) are passed by value only.
                // Options (--name) are passed as --name=value.
                if (0 !== \strpos($key, '-')) {
                    $args[] = (string) $value;
                } else {
                    $args[] = "{$key}={$value}";
                }
            }
        }

        return $args;
    }

    private function decodeBody(Request $request): array
    {
        $content = $request->getContent();
        if ('' === $content) {
            return [];
        }

        try {
            return (array) \json_decode($content, true, 512, \JSON_THROW_ON_ERROR);
        } catch (\JsonException $e) {
            return [];
        }
    }

    private function emitNdjson(array $data): void
    {
        echo \json_encode($data, \JSON_THROW_ON_ERROR)."\n";
        @\ob_flush();
        \flush();
    }
}
