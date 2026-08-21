<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('absences', function (Blueprint $table) {
            $table->string('type')->default('absence')->after('user_id');
        });

        DB::table('absences')->whereRaw("LOWER(COALESCE(reason, '')) LIKE ?", ['%fri%'])->update(['type' => 'day_off']);
    }

    public function down(): void
    {
        Schema::table('absences', function (Blueprint $table) {
            $table->dropColumn('type');
        });
    }
};
