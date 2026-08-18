<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class MailImportItem extends Model {protected $guarded=[];protected $casts=['service_date'=>'date'];public function mailImport(){return $this->belongsTo(MailImport::class);}public function task(){return $this->belongsTo(BusTask::class,'bus_task_id');}}
