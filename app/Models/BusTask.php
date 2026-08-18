<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class BusTask extends Model {
    protected $guarded = [];
    protected $casts = ['scheduled_at'=>'datetime','picked_up_at'=>'datetime','delivered_at'=>'datetime','cancelled_at'=>'datetime','requires_driving_license'=>'boolean'];
    public function customer(){ return $this->belongsTo(Customer::class); }
    public function employee(){ return $this->belongsTo(User::class, 'employee_id'); }
    public function deviations(){ return $this->hasMany(Deviation::class); }
}
