<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::table('users', function (Blueprint $table) {
            $table->string('role')->default('employee')->index();
            $table->string('phone')->nullable();
            $table->boolean('has_driving_license')->default(true);
        });
        Schema::create('customers', function (Blueprint $table) {
            $table->id(); $table->string('name'); $table->string('contact_name')->nullable();
            $table->string('email')->nullable(); $table->string('phone')->nullable(); $table->timestamps();
        });
        Schema::create('bus_tasks', function (Blueprint $table) {
            $table->id(); $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $table->foreignId('created_by')->constrained('users');
            $table->foreignId('employee_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('bus_number'); $table->string('pickup_location'); $table->string('dropoff_location')->nullable();
            $table->dateTime('scheduled_at'); $table->string('task_type')->default('out');
            $table->boolean('requires_driving_license')->default(false); $table->string('status')->default('unassigned')->index();
            $table->unsignedInteger('delay_minutes')->default(0); $table->text('notes')->nullable();
            $table->timestamp('picked_up_at')->nullable(); $table->timestamp('delivered_at')->nullable(); $table->timestamp('cancelled_at')->nullable();
            $table->timestamps();
        });
        Schema::create('deviations', function (Blueprint $table) {
            $table->id(); $table->foreignId('bus_task_id')->constrained()->cascadeOnDelete();
            $table->foreignId('reported_by')->constrained('users'); $table->string('category'); $table->text('description'); $table->timestamps();
        });
        Schema::create('absences', function (Blueprint $table) {
            $table->id(); $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->date('starts_on'); $table->date('ends_on'); $table->string('reason')->nullable(); $table->timestamps();
        });
        Schema::create('activity_logs', function (Blueprint $table) {
            $table->id(); $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('action'); $table->string('subject_type')->nullable(); $table->unsignedBigInteger('subject_id')->nullable();
            $table->json('details')->nullable(); $table->timestamps();
        });
    }
    public function down(): void {
        Schema::dropIfExists('activity_logs'); Schema::dropIfExists('absences'); Schema::dropIfExists('deviations');
        Schema::dropIfExists('bus_tasks'); Schema::dropIfExists('customers');
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn(['role','phone','has_driving_license']));
    }
};
