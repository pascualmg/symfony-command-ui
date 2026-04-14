<?php

declare(strict_types=1);

use Pascualmg\SymfonyCommandUI\Controller\CommandController;
use Symfony\Component\Routing\Loader\Configurator\RoutingConfigurator;

return function (RoutingConfigurator $routes) {
    // Routes are registered by the controller annotations.
    // This file enables annotation loading from the bundle.
    $routes->import(CommandController::class, 'annotation');
};
