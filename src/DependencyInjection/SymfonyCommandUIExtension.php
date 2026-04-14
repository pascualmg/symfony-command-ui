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
        $container->setParameter('symfony_command_ui.allowed_commands', $config['allowed_commands']);
        $container->setParameter('symfony_command_ui.overrides', $config['overrides']);

        $container->register(CommandController::class)
            ->setPublic(true)
            ->addTag('controller.service_arguments')
            ->setArgument('$projectDir', '%kernel.project_dir%')
            ->setArgument('$allowedCommands', '%symfony_command_ui.allowed_commands%')
            ->setArgument('$configOverrides', '%symfony_command_ui.overrides%')
            ->setArgument('$routePrefix', '%symfony_command_ui.route_prefix%');
    }
}
