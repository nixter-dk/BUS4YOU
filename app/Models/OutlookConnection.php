<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class OutlookConnection extends Model {protected $guarded=[];protected $casts=['access_token'=>'encrypted','refresh_token'=>'encrypted','expires_at'=>'datetime'];}
