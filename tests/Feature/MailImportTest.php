<?php
namespace Tests\Feature;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;
class MailImportTest extends TestCase {
 use RefreshDatabase;
 public function test_admin_can_parse_weekend_mail_text_into_a_draft():void{
  $admin=User::factory()->create(['role'=>'admin']);
  $content="Lördag 1/8\nG4\t75195\t07:00\nX2 framkörning\t75192\t10:40\nSöndag 2/8\nG6\t75191\t11:20";
  $this->actingAs($admin)->postJson('/api/mail-import/preview',['content'=>$content,'received_at'=>'2026-07-31 12:00:00'])->assertCreated()->assertJsonCount(3,'items');
  $this->assertDatabaseHas('mail_import_items',['service_date'=>'2026-08-01 00:00:00','bus_number'=>'75195','arrival_time'=>'07:00:00']);
 }
 public function test_non_admin_cannot_access_mail_import():void{
  $user=User::factory()->create(['role'=>'employee']);$this->actingAs($user)->postJson('/api/mail-import/preview',['content'=>'test'])->assertForbidden();
 }
 public function test_ocr_text_with_imperfect_swedish_day_names_is_parsed():void{
  $admin=User::factory()->create(['role'=>'admin']);
  $content="Lérdag 1/8\nOmlopp Buss Ankomst Kph\nG4 75195 07:00]\nSéndag 2/8\nG6 75191 11:20}";
  $this->actingAs($admin)->postJson('/api/mail-import/preview',['content'=>$content,'received_at'=>'2026-07-31 12:00:00'])->assertCreated()->assertJsonCount(2,'items');
  $this->assertDatabaseHas('mail_import_items',['service_date'=>'2026-08-01 00:00:00','bus_number'=>'75195','arrival_time'=>'07:00:00']);
  $this->assertDatabaseHas('mail_import_items',['service_date'=>'2026-08-02 00:00:00','bus_number'=>'75191','arrival_time'=>'11:20:00']);
 }
}
