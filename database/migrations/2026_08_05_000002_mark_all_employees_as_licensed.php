<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void
    {
        DB::table('users')->where('role', 'employee')->update(['has_driving_license' => true]);
    }

    public function down(): void
    {
        // Alle medarbejdere har førerkort; ændringen rulles ikke tilbage til ukendte værdier.
    }
};
