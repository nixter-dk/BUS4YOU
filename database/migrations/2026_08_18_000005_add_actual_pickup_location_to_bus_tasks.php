<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('bus_tasks', function (Blueprint $table) {
            $table->string('actual_pickup_location')->nullable()->after('pickup_location');
        });
    }

    public function down(): void
    {
        Schema::table('bus_tasks', function (Blueprint $table) {
            $table->dropColumn('actual_pickup_location');
        });
    }
};
