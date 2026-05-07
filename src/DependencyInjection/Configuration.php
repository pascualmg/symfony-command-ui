<?php

declare(strict_types=1);

namespace Pascualmg\SymfonyCommandUI\DependencyInjection;

use Symfony\Component\Config\Definition\Builder\TreeBuilder;
use Symfony\Component\Config\Definition\ConfigurationInterface;

class Configuration implements ConfigurationInterface
{
    /**
     * Namespaces excluded by default because they can leak info (debug, config),
     * destroy state (doctrine, cache, assets), or touch production secrets.
     * Users can override by passing their own `excluded_namespaces`.
     */
    public const DEFAULT_EXCLUDED_NAMESPACES = [
        'debug:',
        'secrets:',
        'doctrine:',
        'dbal:',
        'cache:',
        'config:',
        'assets:',
        'importmap:',
        'messenger:',
        'lint:',
        'router:',
        'translation:',
        'server:',
    ];

    public function getConfigTreeBuilder(): TreeBuilder
    {
        $treeBuilder = new TreeBuilder('symfony_command_ui');
        $rootNode = $treeBuilder->getRootNode();

        $rootNode
            ->children()
                ->scalarNode('route_prefix')
                    ->defaultValue('/symfony-console')
                    ->info('URL prefix for the console UI and API endpoints')
                ->end()
                ->booleanNode('expose_all')
                    ->defaultFalse()
                    ->info('Expose ALL registered commands. Respects excluded_commands/excluded_namespaces. Dangerous in production — guard with kernel.debug.')
                ->end()
                ->booleanNode('this_is_really_dangerous')
                    ->defaultFalse()
                    ->info('NUCLEAR SWITCH: bypasses ALL filters. Every command, including debug/doctrine/dbal/secrets, becomes executable over HTTP. Dev-only. Never set in production.')
                ->end()
                ->booleanNode('collapsed_by_default')
                    ->defaultTrue()
                    ->info('When true, every namespace group renders collapsed on load. Users expand only what they need.')
                ->end()
                ->arrayNode('allowed_commands')
                    ->info('Whitelist of specific commands that can be executed via the UI (exact match).')
                    ->scalarPrototype()->end()
                    ->defaultValue([])
                ->end()
                ->arrayNode('allowed_namespaces')
                    ->info('Prefix-based whitelist, e.g. ["app:"] exposes every command whose name starts with "app:".')
                    ->scalarPrototype()->end()
                    ->defaultValue([])
                ->end()
                ->arrayNode('excluded_commands')
                    ->info('Blacklist of specific commands, applied on top of any allow rule.')
                    ->scalarPrototype()->end()
                    ->defaultValue([])
                ->end()
                ->arrayNode('excluded_namespaces')
                    ->info('Prefix-based blacklist. Defaults to dangerous built-in namespaces (debug, doctrine, cache, secrets, etc.).')
                    ->scalarPrototype()->end()
                    ->defaultValue(self::DEFAULT_EXCLUDED_NAMESPACES)
                ->end()
                ->arrayNode('overrides')
                    ->info('Override auto-discovered config for specific command options (e.g. dropdown values).')
                    ->useAttributeAsKey('command')
                    ->arrayPrototype()
                        ->useAttributeAsKey('option')
                        ->variablePrototype()->end()
                    ->end()
                    ->defaultValue([])
                ->end()
                ->integerNode('max_buffered_output_kb')
                    ->defaultValue(5120)
                    ->min(1)
                    ->info('Maximum stdout/stderr captured per stream when the client requests a buffered response (Accept: application/json). Output beyond this cap is truncated and the response carries "truncated":true. Default: 5 MB. Lower it on memory-constrained servers, raise it for export-style commands.')
                ->end()
            ->end();

        return $treeBuilder;
    }
}
