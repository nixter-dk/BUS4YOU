<?php
namespace App\Http\Controllers;
use App\Models\{BusTask,Customer,MailImport,MailImportItem,OutlookConnection};
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;

class MailImportController extends Controller {
 private function admin(Request $r):void{abort_unless($r->user()->role==='admin',403);}
 public function connect(Request $r){
  $this->admin($r);
  abort_unless(config('services.microsoft.client_id'),422,'Microsoft Client ID mangler i .env.');
  $state=Str::random(40);
  $verifier=rtrim(strtr(base64_encode(random_bytes(64)),'+/','-_'),'=');
  $challenge=rtrim(strtr(base64_encode(hash('sha256',$verifier,true)),'+/','-_'),'=');
  $r->session()->put(['outlook_state'=>$state,'outlook_code_verifier'=>$verifier]);
  $query=http_build_query([
   'client_id'=>config('services.microsoft.client_id'),
   'response_type'=>'code',
   'redirect_uri'=>config('services.microsoft.redirect'),
   'response_mode'=>'query',
   'scope'=>'openid profile email offline_access Mail.Read User.Read',
   'state'=>$state,
   'code_challenge'=>$challenge,
   'code_challenge_method'=>'S256',
  ]);
  return redirect('https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?'.$query);
 }
 public function callback(Request $r){
  $this->admin($r);
  $expectedState=(string)$r->session()->pull('outlook_state');
  $verifier=(string)$r->session()->pull('outlook_code_verifier');
  abort_unless($expectedState!==''&&hash_equals($expectedState,(string)$r->state),403);
  if($r->filled('error')){
   $message=Str::limit((string)$r->input('error_description','Microsoft-login blev afvist.'),300);
   return redirect('/?outlook=error')->with('outlook_oauth_error',$message);
  }
  if(!$r->filled('code')||$verifier==='')return redirect('/?outlook=error')->with('outlook_oauth_error','Microsoft-login mangler en sikkerhedskode. Prøv at forbinde Outlook igen.');
  $response=Http::asForm()->post('https://login.microsoftonline.com/consumers/oauth2/v2.0/token',[
   'client_id'=>config('services.microsoft.client_id'),
   'client_secret'=>config('services.microsoft.client_secret'),
   'code'=>$r->code,
   'code_verifier'=>$verifier,
   'redirect_uri'=>config('services.microsoft.redirect'),
   'grant_type'=>'authorization_code',
   'scope'=>'openid profile email offline_access Mail.Read User.Read',
  ]);
  if($response->failed()){
   $message=Str::limit((string)($response->json('error_description')??'Microsoft kunne ikke fuldføre Outlook-forbindelsen.'),300);
   return redirect('/?outlook=error')->with('outlook_oauth_error',$message);
  }
  $token=$response->json();
  $profileResponse=Http::withToken($token['access_token'])->get('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName');
  if($profileResponse->failed())return redirect('/?outlook=error')->with('outlook_oauth_error','Outlook blev godkendt, men kontooplysningerne kunne ikke hentes. Prøv igen.');
  $profile=$profileResponse->json();
  OutlookConnection::updateOrCreate(['user_id'=>$r->user()->id],['email'=>$profile['mail']??$profile['userPrincipalName']??null,'access_token'=>$token['access_token'],'refresh_token'=>$token['refresh_token']??null,'expires_at'=>now()->addSeconds($token['expires_in']??3600)]);
  return redirect('/?outlook=connected');
 }
 private function token(OutlookConnection $c):string{if($c->expires_at?->isFuture())return $c->access_token;abort_unless($c->refresh_token,401,'Forbind Outlook igen.');$t=Http::asForm()->post('https://login.microsoftonline.com/consumers/oauth2/v2.0/token',['client_id'=>config('services.microsoft.client_id'),'client_secret'=>config('services.microsoft.client_secret'),'refresh_token'=>$c->refresh_token,'grant_type'=>'refresh_token','scope'=>'openid profile email offline_access Mail.Read User.Read'])->throw()->json();$c->update(['access_token'=>$t['access_token'],'refresh_token'=>$t['refresh_token']??$c->refresh_token,'expires_at'=>now()->addSeconds($t['expires_in']??3600)]);return $t['access_token'];}
 public function sync(Request $r){
  $this->admin($r);
  $c=OutlookConnection::where('user_id',$r->user()->id)->firstOrFail();
  $accessToken=$this->token($c);
  $messages=Http::withToken($accessToken)->get('https://graph.microsoft.com/v1.0/me/messages',['$top'=>50,'$select'=>'id,subject,receivedDateTime,from,body,hasAttachments','$orderby'=>'receivedDateTime desc'])->throw()->json('value',[]);
  $trusted=0;$recognized=0;$created=0;$items=0;$duplicates=0;$images=0;
  foreach($messages as $m){
   $sender=mb_strtolower($m['from']['emailAddress']['address']??'');
   $allowed=mb_strtolower((string)config('services.bus4you_mail.sender'));
   $domain=ltrim(mb_strtolower((string)config('services.bus4you_mail.domain')),'@');
   if($allowed?$sender!==$allowed:!str_ends_with($sender,'@'.$domain))continue;
   $trusted++;
   if(MailImport::where('graph_message_id',$m['id'])->exists()){$duplicates++;continue;}
   $body=$m['body']['content']??'';
   $plain=mb_strtolower(html_entity_decode(preg_replace('/<[^>]+>/', ' ', $body),ENT_QUOTES|ENT_HTML5,'UTF-8'));
   $plain=preg_replace('/\s+/u',' ',$plain);
   $received=Carbon::parse($m['receivedDateTime']??now());
   $hasTable=str_contains($plain,'omlopp')&&str_contains($plain,'buss')&&preg_match('/ankomst\s+kph/u',$plain);
   $rows=$hasTable?$this->parse($body,$received):[];
   $source=$body;
   if(!$rows){
    [$rows,$ocrText,$readImages]=$this->readImageAttachments($accessToken,$m['id'],$received);
    $images+=$readImages;
    if($ocrText!=='')$source=$ocrText;
   }
   if(!$rows)continue;
   $recognized++;
   $import=MailImport::create(['graph_message_id'=>$m['id'],'subject'=>$m['subject']??null,'received_at'=>$m['receivedDateTime']??now(),'source_excerpt'=>Str::limit(strip_tags($source),1000)]);
   foreach($rows as $row){$item=$import->items()->firstOrCreate(['service_date'=>$row['service_date'],'bus_number'=>$row['bus_number'],'arrival_time'=>$row['arrival_time']],$row);if($item->wasRecentlyCreated)$items++;}
   if(!$import->items()->exists())$import->update(['status'=>'needs_review']);
   $created++;
  }
  $message=$created
   ?"Fandt {$created} ny mail og oprettede {$items} busopgaver som importkladder."
   :"Ingen nye bustabeller blev importeret. Kontrollerede ".count($messages)." mails; {$trusted} var fra @{$domain}.".($duplicates?" {$duplicates} var allerede kontrolleret.":'');
  return compact('message','created','items','trusted','recognized','duplicates','images')+['checked'=>count($messages)];
 }
 private function readImageAttachments(string $token,string $messageId,Carbon $received):array{
  $attachments=Http::withToken($token)->get("https://graph.microsoft.com/v1.0/me/messages/{$messageId}/attachments")->throw()->json('value',[]);
  $rows=[];$texts=[];$images=0;
  $tesseract=(string)config('services.ocr.tesseract');
  if(!is_file($tesseract))return [[], '', 0];
  foreach($attachments as $attachment){
   $type=mb_strtolower($attachment['contentType']??'');
   if(!in_array($type,['image/png','image/jpeg','image/jpg'],true)||empty($attachment['contentBytes']))continue;
   $binary=base64_decode($attachment['contentBytes'],true);
   if($binary===false||strlen($binary)>12*1024*1024)continue;
   $images++;
   $temporary=tempnam(sys_get_temp_dir(),'busops-ocr-');
   file_put_contents($temporary,$binary);
   try{
    $process=new Process([$tesseract,$temporary,'stdout','-l','eng','--psm','3']);
    $process->setTimeout(45);
    $process->run();
    if(!$process->isSuccessful())continue;
    $text=$process->getOutput();
    $texts[]=$text;
    foreach($this->parse($text,$received) as $row)$rows[$row['service_date'].'|'.$row['bus_number'].'|'.$row['arrival_time']]=$row;
   }finally{@unlink($temporary);}
  }
  return [array_values($rows),implode("\n",$texts),$images];
 }
 public function preview(Request $r){$this->admin($r);$d=$r->validate(['content'=>'required|string','received_at'=>'nullable|date']);$import=MailImport::create(['graph_message_id'=>'manual-'.Str::uuid(),'subject'=>'Manuel importkladde','received_at'=>$d['received_at']??now(),'source_excerpt'=>Str::limit(strip_tags($d['content']),1000)]);foreach($this->parse($d['content'],Carbon::parse($d['received_at']??now())) as $row)$import->items()->create($row);if(!$import->items()->exists())$import->update(['status'=>'needs_review']);return $import->load('items');}
 private function parse(string $html,Carbon $received):array{
  $text=html_entity_decode($html,ENT_QUOTES|ENT_HTML5,'UTF-8');
  $text=preg_replace('/<\/(td|th)>/i',"\t",$text);
  $text=preg_replace('/<\/(tr|p|div|h[1-6])>/i',"\n",$text);
  $lines=preg_split('/\R+/',strip_tags($text));
  $date=$received->copy()->addDay()->startOfDay();$rows=[];
  foreach($lines as $line){
   $line=trim(preg_replace('/ +/',' ',str_replace("\t ","\t",$line)));
   if(preg_match('/^[[:alpha:]À-ÿ]{3,12}\s+(\d{1,2})\/(\d{1,2})/u',$line,$m)){
    $candidate=Carbon::create($received->year,(int)$m[2],(int)$m[1],0,0,0,'Europe/Copenhagen');
    if($received->month===12&&(int)$m[2]===1)$candidate->addYear();$date=$candidate;continue;
   }
   if(preg_match('/^(.+?)(?:\t+|\s{2,}|\s+)(\d{4,6})(?:\t+|\s{2,}|\s+)(\d{1,2}:\d{2})/u',$line,$m)){
    $rows[]=['service_date'=>$date->toDateString(),'loop'=>trim($m[1]),'bus_number'=>$m[2],'arrival_time'=>$m[3].':00','pickup_location'=>'Busterminal','notes'=>trim($m[1]),'confidence'=>100];
   }
  }
  return $rows;
 }
 public function approve(Request $r,MailImport $import){$this->admin($r);abort_unless(in_array($import->status,['draft','needs_review']),422);$customer=Customer::where('name','Bus4You')->firstOrFail();foreach($import->items as $item){$scheduled=Carbon::parse($item->service_date->toDateString().' '.$item->arrival_time,'Europe/Copenhagen');$task=BusTask::firstOrCreate(['customer_id'=>$customer->id,'bus_number'=>$item->bus_number,'scheduled_at'=>$scheduled],['created_by'=>$r->user()->id,'pickup_location'=>$item->pickup_location,'dropoff_location'=>'Københavns Busterminal','task_type'=>'out','requires_driving_license'=>false,'status'=>'unassigned','notes'=>$item->notes]);$item->update(['bus_task_id'=>$task->id]);}$import->update(['status'=>'approved']);return $import->load('items.task');}
 public function reject(Request $r,MailImport $import){$this->admin($r);$import->update(['status'=>'rejected']);return $import;}
}
