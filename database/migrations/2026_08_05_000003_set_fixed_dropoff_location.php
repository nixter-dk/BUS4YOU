<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void
    {
        DB::table('bus_tasks')->update(['dropoff_location' => 'Københavns Busterminal']);
    }

    public function down(): void
    {
        // Tidligere individuelle afleveringssteder kan ikke genskabes sikkert.
    }
};
