<?php

namespace Database\Seeders;

use App\Models\{Customer,User};
use Illuminate\Support\Facades\Hash;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $bootstrapPassword = env('BUSOPS_BOOTSTRAP_PASSWORD');

        if (app()->environment('production') && blank($bootstrapPassword)) {
            throw new \RuntimeException('BUSOPS_BOOTSTRAP_PASSWORD skal være sat i produktion.');
        }

        $password = Hash::make($bootstrapPassword ?: 'BusOps123!');

        $users = [
            ['name'=>'Driftsleder','email'=>'admin@busops.dk','role'=>'admin','has_driving_license'=>true],
            ['name'=>'Bus4You','email'=>'kunde@bus4you.dk','role'=>'customer','has_driving_license'=>false],
            ['name'=>'Fisnik','email'=>'fa@gonbus.dk','role'=>'employee','has_driving_license'=>true],
            ['name'=>'Agron','email'=>'aa@gonbus.dk','role'=>'employee','has_driving_license'=>true],
        ];

        foreach ($users as $user) {
            User::firstOrCreate(
                ['email' => $user['email']],
                [...$user, 'password' => $password],
            );
        }

        Customer::firstOrCreate(
            ['name'=>'Bus4You'],
            ['contact_name'=>'Driftskontoret','email'=>'kunde@bus4you.dk','phone'=>'+45 70 20 30 40'],
        );
    }
}
