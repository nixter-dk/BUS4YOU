<?php

namespace App\Providers;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $certificateBundle = storage_path('app/cacert.pem');

        if (is_file($certificateBundle)) {
            Http::globalOptions([
                'verify' => $certificateBundle,
            ]);
        }
    }
}
