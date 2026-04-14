<?php

declare(strict_types=1);

namespace Pascualmg\SymfonyCommandUI\DependencyInjection;

use Symfony\Component\Config\Definition\Builder\TreeBuilder;
use Symfony\Component\Config\Definition\ConfigurationInterface;

class Configuration implements ConfigurationInterface
{
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
                ->arrayNode('allowed_commands')
                    ->info('Whitelist of Symfony console commands that can be executed via the UI')
                    ->scalarPrototype()->end()
                    ->defaultValue([])
                ->end()
                ->arrayNode('overrides')
                    ->info('Override auto-discovered config for specific command options (e.g. dropdown values)')
                    ->useAttributeAsKey('command')
                    ->arrayPrototype()
                        ->useAttributeAsKey('option')
                        ->variablePrototype()->end()
                    ->end()
                    ->defaultValue([])
                ->end()
            ->end();

        return $treeBuilder;
    }
}
