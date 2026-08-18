<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
 public function up():void{
  Schema::create('outlook_connections',function(Blueprint $t){$t->id();$t->foreignId('user_id')->constrained()->cascadeOnDelete();$t->string('email')->nullable();$t->text('access_token');$t->text('refresh_token')->nullable();$t->timestamp('expires_at')->nullable();$t->timestamps();});
  Schema::create('mail_imports',function(Blueprint $t){$t->id();$t->string('graph_message_id')->unique();$t->string('subject')->nullable();$t->timestamp('received_at')->nullable();$t->string('status')->default('draft')->index();$t->text('source_excerpt')->nullable();$t->timestamps();});
  Schema::create('mail_import_items',function(Blueprint $t){$t->id();$t->foreignId('mail_import_id')->constrained()->cascadeOnDelete();$t->date('service_date');$t->string('loop')->nullable();$t->string('bus_number');$t->time('arrival_time');$t->string('pickup_location')->default('Busterminal');$t->text('notes')->nullable();$t->unsignedTinyInteger('confidence')->default(100);$t->foreignId('bus_task_id')->nullable()->constrained()->nullOnDelete();$t->timestamps();$t->unique(['service_date','bus_number','arrival_time'],'mail_item_unique');});
 }
 public function down():void{Schema::dropIfExists('mail_import_items');Schema::dropIfExists('mail_imports');Schema::dropIfExists('outlook_connections');}
};
