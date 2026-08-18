<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class Absence extends Model { protected $guarded=[]; protected $casts=['starts_on'=>'date','ends_on'=>'date']; public function user(){ return $this->belongsTo(User::class); } }
