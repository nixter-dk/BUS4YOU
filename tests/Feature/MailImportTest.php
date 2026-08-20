<?php
namespace Tests\Feature;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
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
 public function test_outlook_connect_uses_pkce():void{
  config(['services.microsoft.client_id'=>'test-client','services.microsoft.redirect'=>'https://example.test/admin/outlook/callback']);
  $admin=User::factory()->create(['role'=>'admin']);
  $response=$this->actingAs($admin)->get('/admin/outlook/connect')->assertRedirect();
  parse_str((string)parse_url($response->headers->get('Location'),PHP_URL_QUERY),$query);
  $this->assertSame('S256',$query['code_challenge_method']??null);
  $this->assertNotEmpty($query['code_challenge']??null);
  $response->assertSessionHas('outlook_code_verifier')->assertSessionHas('outlook_state');
 }
 public function test_outlook_callback_error_redirects_instead_of_returning_500():void{
  $admin=User::factory()->create(['role'=>'admin']);
  $response=$this->actingAs($admin)->withSession(['outlook_state'=>'valid-state','outlook_code_verifier'=>'verifier'])->get('/admin/outlook/callback?error=invalid_request&error_description=PKCE+required&state=valid-state');
  $response->assertRedirect('/?outlook=error')->assertSessionHas('outlook_oauth_error','PKCE required');
 }
 public function test_outlook_callback_sends_pkce_verifier_to_token_endpoint():void{
  config(['services.microsoft.client_id'=>'test-client','services.microsoft.client_secret'=>'test-secret','services.microsoft.redirect'=>'https://example.test/admin/outlook/callback']);
  Http::fake([
   'login.microsoftonline.com/*'=>Http::response(['access_token'=>'access','refresh_token'=>'refresh','expires_in'=>3600]),
   'graph.microsoft.com/*'=>Http::response(['mail'=>'admin@example.test']),
  ]);
  $admin=User::factory()->create(['role'=>'admin']);
  $this->actingAs($admin)->withSession(['outlook_state'=>'valid-state','outlook_code_verifier'=>'test-verifier'])->get('/admin/outlook/callback?code=test-code&state=valid-state')->assertRedirect('/?outlook=connected');
  Http::assertSent(fn($request)=>str_contains($request->url(),'oauth2/v2.0/token')&&$request['code_verifier']==='test-verifier');
  $this->assertDatabaseHas('outlook_connections',['user_id'=>$admin->id,'email'=>'admin@example.test']);
 }
}
