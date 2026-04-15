<?php

declare(strict_types=1);

namespace Pascualmg\SymfonyCommandUI\DependencyInjection;

use Pascualmg\SymfonyCommandUI\Controller\CommandController;
use Symfony\Component\DependencyInjection\ContainerBuilder;
use Symfony\Component\DependencyInjection\Extension\Extension;

class SymfonyCommandUIExtension extends Extension
{
    public function load(array $configs, ContainerBuilder $container): void
    {
        $configuration = new Configuration();
        $config = $this->processConfiguration($configuration, $configs);

        $container->setParameter('symfony_command_ui.route_prefix', $config['route_prefix']);
        $container->setParameter('symfony_command_ui.expose_all', $config['expose_all']);
        $container->setParameter('symfony_command_ui.this_is_really_dangerous', $config['this_is_really_dangerous']);
        $container->setParameter('symfony_command_ui.collapsed_by_default', $config['collapsed_by_default']);
        $container->setParameter('symfony_command_ui.allowed_commands', $config['allowed_commands']);
        $container->setParameter('symfony_command_ui.allowed_namespaces', $config['allowed_namespaces']);
        $container->setParameter('symfony_command_ui.excluded_commands', $config['excluded_commands']);
        $container->setParameter('symfony_command_ui.excluded_namespaces', $config['excluded_namespaces']);
        $container->setParameter('symfony_command_ui.overrides', $config['overrides']);

        $container->register(CommandController::class)
            ->setPublic(true)
            ->addTag('controller.service_arguments')
            ->setArgument('$projectDir', '%kernel.project_dir%')
            ->setArgument('$thisIsReallyDangerous', '%symfony_command_ui.this_is_really_dangerous%')
            ->setArgument('$exposeAll', '%symfony_command_ui.expose_all%')
            ->setArgument('$allowedCommands', '%symfony_command_ui.allowed_commands%')
            ->setArgument('$allowedNamespaces', '%symfony_command_ui.allowed_namespaces%')
            ->setArgument('$excludedCommands', '%symfony_command_ui.excluded_commands%')
            ->setArgument('$excludedNamespaces', '%symfony_command_ui.excluded_namespaces%')
            ->setArgument('$configOverrides', '%symfony_command_ui.overrides%')
            ->setArgument('$routePrefix', '%symfony_command_ui.route_prefix%')
            ->setArgument('$collapsedByDefault', '%symfony_command_ui.collapsed_by_default%');
    }
}
